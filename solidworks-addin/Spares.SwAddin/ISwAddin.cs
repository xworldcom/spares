using System.Runtime.InteropServices;

namespace Spares.SwAddin
{
    /// <summary>
    /// Official ISwAddin IID used by SolidWorks when QueryInterface-ing a COM add-in.
    /// Defined here so the project compiles without SolidWorks interop DLLs.
    /// </summary>
    [ComImport]
    [Guid("DA306A0D-EAC5-4406-8610-B1DA805D9270")]
    [InterfaceType(ComInterfaceType.InterfaceIsIDispatch)]
    public interface ISwAddin
    {
        bool ConnectToSW([MarshalAs(UnmanagedType.IDispatch)] object thisSw, int cookie);
        bool DisconnectFromSW();
    }
}
