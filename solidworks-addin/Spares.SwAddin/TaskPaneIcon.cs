using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;

namespace Spares.SwAddin
{
    internal static class TaskPaneIcon
    {
        public static string WriteTempBitmap()
        {
            var path = Path.Combine(Path.GetTempPath(), "spares-sw-taskpane.bmp");
            using (var bmp = new Bitmap(20, 20, PixelFormat.Format24bppRgb))
            using (var g = Graphics.FromImage(bmp))
            {
                g.Clear(Color.FromArgb(18, 18, 18));
                using (var brush = new SolidBrush(Color.FromArgb(232, 197, 71)))
                {
                    g.FillRectangle(brush, 3, 3, 14, 14);
                }
                bmp.Save(path, ImageFormat.Bmp);
            }

            return path;
        }
    }
}
