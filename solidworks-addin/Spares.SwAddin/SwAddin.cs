using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using Microsoft.Win32;

namespace Spares.SwAddin
{
    [ComVisible(true)]
    [Guid(SwAddin.AddinGuid)]
    [ProgId("Spares.SwAddin")]
    public class SwAddin : ISwAddin
    {
        public const string AddinGuid = "B7E2C4A1-9D3F-4E18-8A6B-2C5F91D0E7A4";
        public const string Title = "Spares";
        public const string Description = "Publish a machine assembly to oee360";

        private object _swApp;
        private object _taskPaneView;
        private TaskPaneControl _control;
        private int _cookie;
        private string _iconPath;

        public bool ConnectToSW(object thisSw, int cookie)
        {
            _swApp = thisSw;
            _cookie = cookie;
            try
            {
                dynamic app = thisSw;
                app.SetAddinCallbackInfo(0, this, cookie);

                _iconPath = TaskPaneIcon.WriteTempBitmap();
                _taskPaneView = app.CreateTaskpaneView2(_iconPath, Title);
                if (_taskPaneView == null)
                {
                    return true;
                }

                _control = new TaskPaneControl(thisSw);
                dynamic pane = _taskPaneView;
                pane.AddControl(TaskPaneControl.ControlProgId, string.Empty);
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    "Spares add-in loaded but the Task Pane could not be created.\n\n" + ex.Message,
                    Title,
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Warning);
            }

            return true;
        }

        public bool DisconnectFromSW()
        {
            try
            {
                if (_taskPaneView != null)
                {
                    dynamic pane = _taskPaneView;
                    pane.DeleteView();
                }
            }
            catch
            {
                // SolidWorks may already have torn the pane down.
            }

            _taskPaneView = null;
            _control = null;
            _swApp = null;

            if (!string.IsNullOrEmpty(_iconPath))
            {
                try { File.Delete(_iconPath); } catch { /* ignore */ }
            }

            GC.Collect();
            GC.WaitForPendingFinalizers();
            return true;
        }

        [ComRegisterFunction]
        public static void RegisterFunction(Type type)
        {
            var guid = "{" + type.GUID + "}";
            using (var key = Registry.LocalMachine.CreateSubKey(@"SOFTWARE\SOLIDWORKS\AddIns\" + guid))
            {
                if (key == null)
                {
                    return;
                }

                key.SetValue(null, 1);
                key.SetValue("Title", Title);
                key.SetValue("Description", Description);
            }

            using (var key = Registry.CurrentUser.CreateSubKey(@"Software\SolidWorks\AddInsStartup\" + guid))
            {
                key?.SetValue(null, 1, RegistryValueKind.DWord);
            }
        }

        [ComUnregisterFunction]
        public static void UnregisterFunction(Type type)
        {
            var guid = "{" + type.GUID + "}";
            try
            {
                Registry.LocalMachine.DeleteSubKey(@"SOFTWARE\SOLIDWORKS\AddIns\" + guid, false);
            }
            catch
            {
                // already gone
            }

            try
            {
                Registry.CurrentUser.DeleteSubKey(@"Software\SolidWorks\AddInsStartup\" + guid, false);
            }
            catch
            {
                // already gone
            }
        }
    }
}
