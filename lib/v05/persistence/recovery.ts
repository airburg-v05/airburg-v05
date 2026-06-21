import type { V2PersistenceInspection, V2PersistenceStore } from "./contracts";

export const inspectV2PersistenceState = async (
  store: V2PersistenceStore,
): Promise<V2PersistenceInspection> => store.inspectState();
