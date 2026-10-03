export function androidMetricTarget(hostProxy, env = process.env) {
  return {
    platform: env.TESTLAB_METRICS_PLATFORM ?? (hostProxy ? 'android-webview-host-proxy' : 'android-webview'),
    label: env.TESTLAB_METRICS_LABEL ?? (hostProxy ? 'local-android-host-proxy' : 'local-android'),
  };
}
