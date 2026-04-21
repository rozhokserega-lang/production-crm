import { callBackend } from "./api";
import type { RpcAction, RpcPayloadMap, RpcResponseMap } from "./types/rpc";

/**
 * Typed wrapper over callBackend for gradual TS migration.
 * Existing JS code can keep using callBackend directly.
 */
type RpcTypedAction = RpcAction & keyof RpcPayloadMap & keyof RpcResponseMap;

export async function callBackendTyped<A extends RpcTypedAction>(
  action: A,
  payload?: RpcPayloadMap[A],
): Promise<RpcResponseMap[A]> {
  const data = await callBackend(action, (payload || {}) as Record<string, unknown>);
  return data as RpcResponseMap[A];
}
