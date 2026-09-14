using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Web.Script.Serialization;

namespace Spares.SwAddin
{
    internal sealed class PublishResult
    {
        public string Id { get; set; }
        public string Name { get; set; }
    }

    internal sealed class SparesClient : IDisposable
    {
        private static readonly JavaScriptSerializer Json = new JavaScriptSerializer();

        private readonly HttpClient _http;
        private readonly CookieContainer _cookies;
        private string _baseUrl;

        public SparesClient()
        {
            _cookies = new CookieContainer();
            var handler = new HttpClientHandler
            {
                CookieContainer = _cookies,
                UseCookies = true,
                AllowAutoRedirect = false,
            };
            _http = new HttpClient(handler)
            {
                Timeout = TimeSpan.FromMinutes(10),
            };
            _http.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        }

        public string BaseUrl
        {
            get => _baseUrl;
            set => _baseUrl = (value ?? "").Trim().TrimEnd('/');
        }

        public string SignIn(string email, string password)
        {
            var body = Json.Serialize(new Dictionary<string, string>
            {
                { "email", email ?? "" },
                { "password", password ?? "" },
            });
            using (var content = new StringContent(body, Encoding.UTF8, "application/json"))
            using (var response = _http.PostAsync(Url("/api/auth/login"), content).GetAwaiter().GetResult())
            {
                var text = response.Content.ReadAsStringAsync().GetAwaiter().GetResult();
                EnsureJson(response, text, "Sign-in");
                var map = Json.Deserialize<Dictionary<string, object>>(text);
                var user = map != null && map.ContainsKey("user") ? map["user"] as Dictionary<string, object> : null;
                var role = user != null && user.ContainsKey("role") ? Convert.ToString(user["role"]) : "";
                if (!string.Equals(role, "staff", StringComparison.OrdinalIgnoreCase))
                {
                    throw new InvalidOperationException("That account is not staff.");
                }

                return user != null && user.ContainsKey("email")
                    ? Convert.ToString(user["email"])
                    : email;
            }
        }

        public PublishResult Publish(string machineName, string glbPath, IList<PartRow> parts)
        {
            if (string.IsNullOrWhiteSpace(machineName))
            {
                throw new InvalidOperationException("Machine name is required.");
            }

            if (parts == null || parts.Count == 0)
            {
                throw new InvalidOperationException("No parts were read from the assembly.");
            }

            var originalName = Path.GetFileName(glbPath);
            if (!originalName.EndsWith(".glb", StringComparison.OrdinalIgnoreCase)
                && !originalName.EndsWith(".gltf", StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException("Model must be a .glb or .gltf file.");
            }

            var partsJson = BuildPartsJson(parts);
            string storedFileName = null;

            var uploadInfo = GetJson("/api/machines/model-upload");
            var s3 = uploadInfo.ContainsKey("s3Upload") && IsTruthy(uploadInfo["s3Upload"]);
            if (s3)
            {
                var ticketBody = Json.Serialize(new Dictionary<string, string>
                {
                    { "originalFileName", originalName },
                });
                using (var content = new StringContent(ticketBody, Encoding.UTF8, "application/json"))
                using (var ticket = _http.PostAsync(Url("/api/machines/model-upload"), content).GetAwaiter().GetResult())
                {
                    var text = ticket.Content.ReadAsStringAsync().GetAwaiter().GetResult();
                    EnsureJson(ticket, text, "Upload ticket");
                    var map = Json.Deserialize<Dictionary<string, object>>(text);
                    storedFileName = map != null && map.ContainsKey("storedFileName")
                        ? Convert.ToString(map["storedFileName"])
                        : null;
                    var uploadUrl = map != null && map.ContainsKey("uploadUrl")
                        ? Convert.ToString(map["uploadUrl"])
                        : null;
                    if (string.IsNullOrWhiteSpace(storedFileName) || string.IsNullOrWhiteSpace(uploadUrl))
                    {
                        throw new InvalidOperationException("Could not start the model upload.");
                    }

                    using (var file = File.OpenRead(glbPath))
                    using (var putContent = new StreamContent(file))
                    {
                        putContent.Headers.ContentType = new MediaTypeHeaderValue("model/gltf-binary");
                        using (var put = new HttpRequestMessage(HttpMethod.Put, uploadUrl) { Content = putContent })
                        using (var putResponse = _http.SendAsync(put).GetAwaiter().GetResult())
                        {
                            if (!putResponse.IsSuccessStatusCode)
                            {
                                throw new InvalidOperationException("Uploading the GLB to storage failed (" + (int)putResponse.StatusCode + ").");
                            }
                        }
                    }
                }
            }

            using (var form = new MultipartFormDataContent())
            {
                form.Add(new StringContent(machineName), "name");
                var partsBytes = Encoding.UTF8.GetBytes(partsJson);
                var partsContent = new ByteArrayContent(partsBytes);
                partsContent.Headers.ContentType = new MediaTypeHeaderValue("application/json");
                form.Add(partsContent, "partsList", "parts.json");

                if (!string.IsNullOrWhiteSpace(storedFileName))
                {
                    form.Add(new StringContent(storedFileName), "storedFileName");
                    form.Add(new StringContent(originalName), "originalFileName");
                }
                else
                {
                    var fileContent = new ByteArrayContent(File.ReadAllBytes(glbPath));
                    fileContent.Headers.ContentType = new MediaTypeHeaderValue("model/gltf-binary");
                    form.Add(fileContent, "model", originalName);
                }

                using (var response = _http.PostAsync(Url("/api/machines"), form).GetAwaiter().GetResult())
                {
                    var text = response.Content.ReadAsStringAsync().GetAwaiter().GetResult();
                    EnsureJson(response, text, "Create machine");
                    var map = Json.Deserialize<Dictionary<string, object>>(text);
                    var id = map != null && map.ContainsKey("id") ? Convert.ToString(map["id"]) : null;
                    if (string.IsNullOrWhiteSpace(id))
                    {
                        throw new InvalidOperationException("oee360 created the pack but did not return a machine id.");
                    }

                    return new PublishResult
                    {
                        Id = id,
                        Name = map.ContainsKey("name") ? Convert.ToString(map["name"]) : machineName,
                    };
                }
            }
        }

        public static string BuildPartsJson(IList<PartRow> parts)
        {
            var sb = new StringBuilder();
            sb.Append("{\"parts\":[");
            for (var i = 0; i < parts.Count; i++)
            {
                if (i > 0)
                {
                    sb.Append(',');
                }

                var row = parts[i];
                sb.Append('{');
                sb.Append("\"partNumber\":").Append(Quote(row.PartNumber)).Append(',');
                sb.Append("\"name\":").Append(Quote(row.Name)).Append(',');
                sb.Append("\"meshName\":").Append(Quote(string.IsNullOrWhiteSpace(row.MeshName) ? row.PartNumber : row.MeshName)).Append(',');
                sb.Append("\"qty\":").Append(row.Qty < 1 ? 1 : row.Qty);
                sb.Append('}');
            }

            sb.Append("]}");
            return sb.ToString();
        }

        public void Dispose()
        {
            _http.Dispose();
        }

        private Dictionary<string, object> GetJson(string path)
        {
            using (var response = _http.GetAsync(Url(path)).GetAwaiter().GetResult())
            {
                var text = response.Content.ReadAsStringAsync().GetAwaiter().GetResult();
                EnsureJson(response, text, path);
                return Json.Deserialize<Dictionary<string, object>>(text) ?? new Dictionary<string, object>();
            }
        }

        private Uri Url(string path)
        {
            if (string.IsNullOrWhiteSpace(_baseUrl))
            {
                throw new InvalidOperationException("Set the oee360 URL first.");
            }

            return new Uri(_baseUrl + path);
        }

        private static void EnsureJson(HttpResponseMessage response, string text, string action)
        {
            var looksHtml = !string.IsNullOrEmpty(text) && text.TrimStart().StartsWith("<", StringComparison.Ordinal);
            if (looksHtml)
            {
                throw new InvalidOperationException(
                    action + " hit a web login wall (Vercel SSO or the wrong URL). Point the add-in at local http://localhost:3000 or an origin that accepts the staff app login.");
            }

            if (response.IsSuccessStatusCode || response.StatusCode == HttpStatusCode.Created)
            {
                return;
            }

            string message = action + " failed (" + (int)response.StatusCode + ").";
            try
            {
                var map = Json.Deserialize<Dictionary<string, object>>(text);
                if (map != null && map.ContainsKey("error"))
                {
                    message = Convert.ToString(map["error"]);
                }
            }
            catch
            {
                if (!string.IsNullOrWhiteSpace(text))
                {
                    message = text.Length > 240 ? text.Substring(0, 240) : text;
                }
            }

            throw new InvalidOperationException(message);
        }

        private static bool IsTruthy(object value)
        {
            if (value is bool flag)
            {
                return flag;
            }

            return string.Equals(Convert.ToString(value), "true", StringComparison.OrdinalIgnoreCase);
        }

        private static string Quote(string value)
        {
            var raw = value ?? "";
            var sb = new StringBuilder("\"");
            foreach (var ch in raw)
            {
                switch (ch)
                {
                    case '\\': sb.Append("\\\\"); break;
                    case '"': sb.Append("\\\""); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\r': sb.Append("\\r"); break;
                    case '\t': sb.Append("\\t"); break;
                    default:
                        if (ch < 32)
                        {
                            sb.Append("\\u").Append(((int)ch).ToString("x4"));
                        }
                        else
                        {
                            sb.Append(ch);
                        }
                        break;
                }
            }

            sb.Append('"');
            return sb.ToString();
        }
    }
}
