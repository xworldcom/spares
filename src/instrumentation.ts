export async function register() {
  const { assertManagedRuntimeEnv } = await import("./lib/production-env");
  assertManagedRuntimeEnv();
}
