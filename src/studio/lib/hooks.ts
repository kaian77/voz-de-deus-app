import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "./api";
import type { IgProfileData, TableMap, TableName } from "./types";

export function useTable<T extends TableName>(
  table: T,
  opts?: { order?: string; ascending?: boolean; limit?: number; eq?: Record<string, string> },
  query?: { enabled?: boolean; refetchInterval?: number },
) {
  return useQuery({
    queryKey: ["table", table, opts],
    queryFn: () => api.list(table, opts),
    ...query,
  });
}

export function useSettings() {
  return useQuery({ queryKey: ["settings"], queryFn: () => api.getSettings() });
}

export function useSaveRow<T extends TableName>(table: T) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: Partial<TableMap[T]> & { id?: string }) => {
      const { id, ...rest } = row;
      return id ? api.update(table, id, rest as Partial<TableMap[T]>) : api.insert(table, rest as Partial<TableMap[T]>);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["table", table] }),
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useRemoveRow(table: TableName) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.remove(table, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["table", table] }),
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useInvalidate() {
  const qc = useQueryClient();
  return (table?: TableName) => qc.invalidateQueries({ queryKey: table ? ["table", table] : ["table"] });
}

/** Perfil + posts recentes do Instagram, ao vivo (só busca se houver conta conectada). */
export function useInstagramProfile(enabled = true) {
  const { data: accounts } = useTable("social_accounts");
  const hasIg = Boolean(accounts?.some((a) => a.platform === "instagram"));
  return useQuery({
    queryKey: ["ig-profile"],
    queryFn: () => api.invoke<IgProfileData>("ai", { action: "profile" }),
    enabled: enabled && hasIg,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}
