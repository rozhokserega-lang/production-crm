export function isCrmProductionOrigin(origin) {
  return /^https:\/\/(www\.)?crm-v175\.ru$/i.test(String(origin || "").trim());
}

export function isBrokenCrmProxyHost(url) {
  return /^https:\/\/supabase-proxy\.crm-v175\.ru/i.test(String(url || "").trim());
}

export function buildSupabaseRpcRouteCandidates({
  origin = "",
  directUrl = "",
  proxyUrl = "",
  proxyEnabled = true,
}) {
  const direct = String(directUrl || "").trim().replace(/\/$/, "");
  const proxy = String(proxyUrl || "").trim().replace(/\/$/, "");
  const normalizedOrigin = String(origin || "").trim().replace(/\/$/, "");
  const usesLocalDevProxy = proxy === "/supabase";
  let sameOriginProxy = "";
  if (isCrmProductionOrigin(normalizedOrigin)) {
    sameOriginProxy = `${normalizedOrigin}/supabase`;
  } else if (normalizedOrigin && usesLocalDevProxy) {
    sameOriginProxy = `${normalizedOrigin}/supabase`;
  }
  const usableProxy = proxy && !usesLocalDevProxy && !isBrokenCrmProxyHost(proxy) ? proxy : "";

  const proxyRoutes = sameOriginProxy
    ? [sameOriginProxy, direct, usableProxy]
    : [direct, usableProxy];

  const normalizedProxyRoutes = Array.from(new Set(proxyRoutes.filter(Boolean)));
  if (!proxyEnabled) {
    return Array.from(new Set([direct, ...normalizedProxyRoutes].filter(Boolean)));
  }
  return normalizedProxyRoutes;
}

export function finalizeSupabaseRpcRoutes(routes) {
  const list = Array.from(new Set((routes || []).filter(Boolean)));
  const localProxy = list.find(
    (route) => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/supabase$/i.test(String(route || "")),
  );
  if (localProxy) {
    return [localProxy];
  }
  return list;
}
