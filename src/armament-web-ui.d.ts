declare module 'armament-web-ui' {
  export function startWebServer(opts?: { port?: number }): Promise<void>;
}
