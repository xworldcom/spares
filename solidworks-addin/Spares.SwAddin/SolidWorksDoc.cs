using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;

namespace Spares.SwAddin
{
    public sealed class PartRow
    {
        public string PartNumber { get; set; }
        public string Name { get; set; }
        public string MeshName { get; set; }
        public int Qty { get; set; }
    }

    internal static class SolidWorksDoc
    {
        private const int SwDocPart = 1;
        private const int SwDocAssembly = 2;
        private const int SwComponentSuppressed = 0;

        public static string ActiveTitle(object swApp)
        {
            dynamic app = swApp;
            dynamic model = app.ActiveDoc;
            if (model == null)
            {
                return "";
            }

            var path = (string)model.GetPathName();
            if (!string.IsNullOrWhiteSpace(path))
            {
                return Path.GetFileNameWithoutExtension(path);
            }

            return ((string)model.GetTitle() ?? "Machine").Replace(".SLDASM", "").Replace(".sldasm", "");
        }

        public static List<PartRow> ReadBom(object swApp)
        {
            dynamic app = swApp;
            dynamic model = app.ActiveDoc;
            if (model == null)
            {
                throw new InvalidOperationException("Open a part or assembly first.");
            }

            int docType = (int)model.GetType();
            var raw = new List<PartRow>();

            if (docType == SwDocPart)
            {
                raw.Add(FromModel(model, 1));
            }
            else if (docType == SwDocAssembly)
            {
                try
                {
                    model.ResolveAllLightweightComponents(true);
                }
                catch
                {
                    // older seats may not expose this
                }

                dynamic config = model.GetActiveConfiguration();
                dynamic root = config.GetRootComponent3(true);
                WalkComponent(root, raw);
            }
            else
            {
                throw new InvalidOperationException("Switch to a part or assembly (not a drawing).");
            }

            return raw
                .Where(row => !string.IsNullOrWhiteSpace(row.PartNumber) && !string.IsNullOrWhiteSpace(row.Name))
                .GroupBy(row => row.PartNumber.Trim(), StringComparer.OrdinalIgnoreCase)
                .Select(group => new PartRow
                {
                    PartNumber = group.First().PartNumber.Trim(),
                    Name = group.First().Name.Trim(),
                    MeshName = string.IsNullOrWhiteSpace(group.First().MeshName)
                        ? group.First().PartNumber.Trim()
                        : group.First().MeshName.Trim(),
                    Qty = group.Sum(row => row.Qty < 1 ? 1 : row.Qty),
                })
                .OrderBy(row => row.PartNumber, StringComparer.OrdinalIgnoreCase)
                .ToList();
        }

        public static string ExportGlb(object swApp, string machineName)
        {
            dynamic app = swApp;
            dynamic model = app.ActiveDoc;
            if (model == null)
            {
                throw new InvalidOperationException("Open a part or assembly first.");
            }

            var safe = string.Join("_", (machineName ?? "machine").Split(Path.GetInvalidFileNameChars()));
            if (string.IsNullOrWhiteSpace(safe))
            {
                safe = "machine";
            }

            var dir = Path.Combine(Path.GetTempPath(), "spares-publish");
            Directory.CreateDirectory(dir);
            var path = Path.Combine(dir, safe + ".glb");
            if (File.Exists(path))
            {
                File.Delete(path);
            }

            try
            {
                model.ClearSelection2(true);
            }
            catch
            {
                // optional
            }

            int errors = 0;
            int warnings = 0;
            bool ok;
            try
            {
                ok = (bool)model.Extension.SaveAs3(path, 0, 1, null, null, ref errors, ref warnings);
            }
            catch
            {
                ok = (int)model.SaveAs3(path, 0, 1) == 0;
            }

            if (!ok || !File.Exists(path) || new FileInfo(path).Length == 0)
            {
                throw new InvalidOperationException(
                    "SolidWorks could not export GLB. Use SOLIDWORKS 2024+ (File → Save As → Extended Reality) or upload a GLB from the website.");
            }

            return path;
        }

        private static void WalkComponent(dynamic component, List<PartRow> rows)
        {
            if (component == null)
            {
                return;
            }

            object childrenObj;
            try
            {
                childrenObj = component.GetChildren();
            }
            catch
            {
                return;
            }

            if (!(childrenObj is object[] children))
            {
                return;
            }

            foreach (var childObj in children)
            {
                if (childObj == null)
                {
                    continue;
                }

                dynamic child = childObj;
                int suppression = 1;
                try
                {
                    suppression = (int)child.GetSuppression();
                }
                catch
                {
                    // treat as resolved
                }

                if (suppression == SwComponentSuppressed)
                {
                    continue;
                }

                bool isToolbox = false;
                try
                {
                    isToolbox = (bool)child.IsToolboxComponent();
                }
                catch
                {
                    // keep hardware that is not flagged
                }

                if (!isToolbox)
                {
                    rows.Add(FromComponent(child));
                }

                WalkComponent(child, rows);
            }
        }

        private static PartRow FromComponent(dynamic component)
        {
            string path = "";
            try
            {
                path = (string)component.GetPathName();
            }
            catch
            {
                // ignore
            }

            var fileStem = string.IsNullOrWhiteSpace(path)
                ? ""
                : Path.GetFileNameWithoutExtension(path);

            dynamic model = null;
            try
            {
                model = component.GetModelDoc2();
            }
            catch
            {
                // lightweight leftover
            }

            if (model != null)
            {
                var row = FromModel(model, 1);
                if (string.IsNullOrWhiteSpace(row.MeshName))
                {
                    row.MeshName = fileStem;
                }

                return row;
            }

            return new PartRow
            {
                PartNumber = fileStem,
                Name = fileStem,
                MeshName = fileStem,
                Qty = 1,
            };
        }

        private static PartRow FromModel(dynamic model, int qty)
        {
            string path = "";
            try
            {
                path = (string)model.GetPathName();
            }
            catch
            {
                // unsaved
            }

            var fileStem = string.IsNullOrWhiteSpace(path)
                ? ((string)model.GetTitle() ?? "Part")
                : Path.GetFileNameWithoutExtension(path);

            var partNumber =
                ReadProperty(model, "PartNumber")
                ?? ReadProperty(model, "Part Number")
                ?? ReadProperty(model, "PartNo")
                ?? ReadProperty(model, "Base Item Number")
                ?? fileStem;

            var name =
                ReadProperty(model, "Description")
                ?? ReadProperty(model, "PartName")
                ?? ReadProperty(model, "Name")
                ?? fileStem;

            return new PartRow
            {
                PartNumber = partNumber,
                Name = name,
                MeshName = partNumber,
                Qty = qty,
            };
        }

        private static string ReadProperty(dynamic model, string field)
        {
            try
            {
                dynamic mgr = model.Extension.CustomPropertyManager[""];
                string value = "";
                string resolved = "";
                bool wasResolved = false;
                bool link = false;
                try
                {
                    mgr.Get6(field, false, out value, out resolved, out wasResolved, out link);
                }
                catch
                {
                    mgr.Get4(field, false, out value, out resolved);
                }

                var picked = !string.IsNullOrWhiteSpace(resolved) ? resolved : value;
                return string.IsNullOrWhiteSpace(picked) ? null : picked.Trim();
            }
            catch
            {
                return null;
            }
        }
    }
}
