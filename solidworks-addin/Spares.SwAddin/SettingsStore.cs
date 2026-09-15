using System;
using System.IO;
using System.Web.Script.Serialization;

namespace Spares.SwAddin
{
    public sealed class AddinSettings
    {
        public string BaseUrl { get; set; } = "http://localhost:3000";
        public string Email { get; set; } = "";
    }

    internal static class SettingsStore
    {
        private static readonly JavaScriptSerializer Json = new JavaScriptSerializer();

        public static string FilePath
        {
            get
            {
                var dir = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                    "Spares");
                Directory.CreateDirectory(dir);
                return Path.Combine(dir, "sw-addin.json");
            }
        }

        public static AddinSettings Load()
        {
            try
            {
                if (!File.Exists(FilePath))
                {
                    return new AddinSettings();
                }

                var text = File.ReadAllText(FilePath);
                return Json.Deserialize<AddinSettings>(text) ?? new AddinSettings();
            }
            catch
            {
                return new AddinSettings();
            }
        }

        public static void Save(AddinSettings settings)
        {
            File.WriteAllText(FilePath, Json.Serialize(settings));
        }
    }
}
