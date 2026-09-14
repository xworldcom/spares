using System;
using System.Diagnostics;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace Spares.SwAddin
{
    [ComVisible(true)]
    [Guid(TaskPaneControl.ControlGuid)]
    [ProgId(TaskPaneControl.ControlProgId)]
    public class TaskPaneControl : UserControl
    {
        public const string ControlGuid = "C1A84F20-6B3D-4A11-9E52-8D7C4B1F0A33";
        public const string ControlProgId = "Spares.SwAddin.TaskPane";

        private readonly TextBox _baseUrl;
        private readonly TextBox _email;
        private readonly TextBox _password;
        private readonly TextBox _machineName;
        private readonly Label _status;
        private readonly Label _partsPreview;
        private readonly Button _signIn;
        private readonly Button _refresh;
        private readonly Button _upload;
        private object _swApp;
        private readonly SparesClient _client = new SparesClient();
        private bool _signedIn;

        public TaskPaneControl()
        {
            _swApp = TryGetSolidWorks();

            BackColor = Color.FromArgb(18, 18, 18);
            ForeColor = Color.FromArgb(236, 236, 236);
            Font = new Font("Segoe UI", 9F);
            Padding = new Padding(12);
            Dock = DockStyle.Fill;

            var settings = SettingsStore.Load();

            var layout = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                ColumnCount = 1,
                AutoSize = false,
                BackColor = BackColor,
            };
            layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));

            var form = new FlowLayoutPanel
            {
                FlowDirection = FlowDirection.TopDown,
                WrapContents = false,
                AutoSize = true,
                Dock = DockStyle.Top,
                Width = 280,
                BackColor = BackColor,
            };

            form.Controls.Add(Label("oee360 URL"));
            _baseUrl = Field(settings.BaseUrl);
            form.Controls.Add(_baseUrl);

            form.Controls.Add(Label("Staff email"));
            _email = Field(settings.Email);
            form.Controls.Add(_email);

            form.Controls.Add(Label("Password"));
            _password = Field("");
            _password.UseSystemPasswordChar = true;
            form.Controls.Add(_password);

            _signIn = ActionButton("Sign in");
            _signIn.Click += (_, __) => SignIn();
            form.Controls.Add(_signIn);

            form.Controls.Add(Label("Machine name"));
            _machineName = Field(SolidWorksDoc.ActiveTitle(_swApp));
            form.Controls.Add(_machineName);

            var buttons = new FlowLayoutPanel
            {
                FlowDirection = FlowDirection.LeftToRight,
                AutoSize = true,
                WrapContents = false,
                BackColor = BackColor,
                Margin = new Padding(0, 8, 0, 8),
            };
            _refresh = ActionButton("Read assembly");
            _refresh.Width = 128;
            _refresh.Click += (_, __) => RefreshBom();
            _upload = ActionButton("Upload");
            _upload.Width = 128;
            _upload.Click += (_, __) => Upload();
            buttons.Controls.Add(_refresh);
            buttons.Controls.Add(_upload);
            form.Controls.Add(buttons);

            _status = new Label
            {
                AutoSize = true,
                MaximumSize = new Size(260, 0),
                ForeColor = Color.FromArgb(180, 180, 180),
                Text = "Sign in as staff, open the assembly, then Upload. Customer and site are set on oee360.",
                Margin = new Padding(0, 4, 0, 8),
            };
            form.Controls.Add(_status);

            _partsPreview = new Label
            {
                Dock = DockStyle.Fill,
                ForeColor = Color.FromArgb(210, 210, 210),
                Text = "Parts list appears after Read assembly.",
            };

            layout.Controls.Add(form, 0, 0);
            layout.Controls.Add(_partsPreview, 0, 1);
            Controls.Add(layout);
        }

        public TaskPaneControl(object swApp) : this()
        {
            if (swApp != null)
            {
                _swApp = swApp;
            }
        }

        private void SignIn()
        {
            try
            {
                PersistSettings();
                _client.BaseUrl = _baseUrl.Text.Trim();
                var email = _client.SignIn(_email.Text.Trim(), _password.Text);
                _signedIn = true;
                _password.Text = "";
                SetStatus("Signed in as " + email + ". Open the machine assembly and Upload.");
            }
            catch (Exception ex)
            {
                _signedIn = false;
                SetStatus(ex.Message, true);
            }
        }

        private void RefreshBom()
        {
            try
            {
                BindSolidWorks();
                var title = SolidWorksDoc.ActiveTitle(_swApp);
                if (string.IsNullOrWhiteSpace(_machineName.Text))
                {
                    _machineName.Text = title;
                }

                var parts = SolidWorksDoc.ReadBom(_swApp);
                _partsPreview.Text = parts.Count + " unique part number(s)\r\n\r\n"
                    + string.Join("\r\n", parts.ConvertAll(p => p.Qty + " × " + p.PartNumber + " — " + p.Name));
                SetStatus("Ready to upload " + parts.Count + " part numbers. No Excel file needed.");
            }
            catch (Exception ex)
            {
                SetStatus(ex.Message, true);
            }
        }

        private void Upload()
        {
            try
            {
                BindSolidWorks();
                if (!_signedIn)
                {
                    SignIn();
                    if (!_signedIn)
                    {
                        return;
                    }
                }

                SetStatus("Reading assembly…");
                Application.DoEvents();
                var name = _machineName.Text.Trim();
                if (string.IsNullOrWhiteSpace(name))
                {
                    name = SolidWorksDoc.ActiveTitle(_swApp);
                    _machineName.Text = name;
                }

                var parts = SolidWorksDoc.ReadBom(_swApp);
                _partsPreview.Text = parts.Count + " unique part number(s)\r\n\r\n"
                    + string.Join("\r\n", parts.ConvertAll(p => p.Qty + " × " + p.PartNumber + " — " + p.Name));

                SetStatus("Exporting GLB…");
                Application.DoEvents();
                var glb = SolidWorksDoc.ExportGlb(_swApp, name);

                SetStatus("Uploading pack to oee360…");
                Application.DoEvents();
                _client.BaseUrl = _baseUrl.Text.Trim();
                var created = _client.Publish(name, glb, parts);

                var page = _baseUrl.Text.Trim().TrimEnd('/') + "/machines/" + created.Id;
                SetStatus("Created " + created.Name + ". Opening oee360 to attach customer and site.");
                Process.Start(new ProcessStartInfo
                {
                    FileName = page,
                    UseShellExecute = true,
                });
            }
            catch (Exception ex)
            {
                SetStatus(ex.Message, true);
            }
        }

        private void PersistSettings()
        {
            SettingsStore.Save(new AddinSettings
            {
                BaseUrl = _baseUrl.Text.Trim(),
                Email = _email.Text.Trim(),
            });
        }

        private void BindSolidWorks()
        {
            if (_swApp != null)
            {
                return;
            }

            _swApp = TryGetSolidWorks();
            if (_swApp == null)
            {
                throw new InvalidOperationException("SolidWorks is not running.");
            }
        }

        private void SetStatus(string text, bool error = false)
        {
            _status.ForeColor = error ? Color.FromArgb(232, 120, 90) : Color.FromArgb(180, 180, 180);
            _status.Text = text;
        }

        private static object TryGetSolidWorks()
        {
            try
            {
                return Marshal.GetActiveObject("SldWorks.Application");
            }
            catch
            {
                return null;
            }
        }

        private Label Label(string text)
        {
            return new Label
            {
                Text = text,
                AutoSize = true,
                ForeColor = Color.FromArgb(160, 160, 160),
                Margin = new Padding(0, 8, 0, 2),
            };
        }

        private TextBox Field(string value)
        {
            return new TextBox
            {
                Text = value ?? "",
                Width = 252,
                BackColor = Color.FromArgb(32, 32, 32),
                ForeColor = Color.White,
                BorderStyle = BorderStyle.FixedSingle,
                Margin = new Padding(0, 0, 0, 4),
            };
        }

        private Button ActionButton(string text)
        {
            return new Button
            {
                Text = text,
                Width = 252,
                Height = 28,
                FlatStyle = FlatStyle.Flat,
                BackColor = Color.FromArgb(232, 197, 71),
                ForeColor = Color.Black,
                Margin = new Padding(0, 4, 8, 4),
            };
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                _client.Dispose();
            }

            base.Dispose(disposing);
        }
    }
}
