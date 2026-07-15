import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "./client";

/**
 * Query keys. Centralised so an invalidation can't silently miss a screen.
 */
export const keys = {
  balance: ["balance"],
  categories: ["categories"],
  summary: (y, m) => ["summary", y, m],
  expenses: (y, m) => ["expenses", y, m],
  months: ["months"],
  budget: (y, m) => ["budget", y, m],
};

/**
 * Every write to the ledger can move the balance, the month summary, the expense
 * list AND the set of months that have data. Rather than make each mutation
 * remember which of those to refresh (and eventually forget one), invalidate the
 * whole ledger surface after any write. It's one extra refetch on a screen the
 * user is looking at anyway.
 */
function useLedgerInvalidation() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: keys.balance }),
      qc.invalidateQueries({ queryKey: ["summary"] }),
      qc.invalidateQueries({ queryKey: ["expenses"] }),
      qc.invalidateQueries({ queryKey: keys.months }),
    ]);
}

// reads ----------------------------------------------------------------------

export function useBalance() {
  return useQuery({ queryKey: keys.balance, queryFn: () => api.get("/api/balance/") });
}

export function useCategories() {
  return useQuery({
    queryKey: keys.categories,
    queryFn: async () => {
      const data = await api.get("/api/categories/");
      return data.results ?? data; // DRF pagination wraps the list in `results`
    },
    staleTime: 5 * 60_000, // categories change rarely
  });
}

export function useSummary(year, month) {
  return useQuery({
    queryKey: keys.summary(year, month),
    queryFn: () => api.get(`/api/summary/?year=${year}&month=${month}`),
  });
}

export function useExpenses(year, month) {
  return useQuery({
    queryKey: keys.expenses(year, month),
    queryFn: async () => {
      const data = await api.get(`/api/expenses/?year=${year}&month=${month}`);
      return data.results ?? data;
    },
  });
}

export function useMonths() {
  return useQuery({ queryKey: keys.months, queryFn: () => api.get("/api/months/") });
}

export function useBudget(year, month) {
  return useQuery({
    queryKey: keys.budget(year, month),
    queryFn: () => api.get(`/api/budget/?year=${year}&month=${month}`),
  });
}

// writes ---------------------------------------------------------------------

export function useCreateExpense() {
  const invalidate = useLedgerInvalidation();
  return useMutation({
    mutationFn: (body) => api.post("/api/expenses/", body),
    onSuccess: invalidate,
  });
}

export function useUpdateExpense() {
  const invalidate = useLedgerInvalidation();
  return useMutation({
    mutationFn: ({ id, ...body }) => api.patch(`/api/expenses/${id}/`, body),
    onSuccess: invalidate,
  });
}

export function useDeleteExpense() {
  const invalidate = useLedgerInvalidation();
  return useMutation({
    mutationFn: (id) => api.delete(`/api/expenses/${id}/`),
    onSuccess: invalidate,
  });
}

export function useCreateIncome() {
  const invalidate = useLedgerInvalidation();
  return useMutation({
    mutationFn: (body) => api.post("/api/income/", body),
    onSuccess: invalidate,
  });
}

export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name) => api.post("/api/categories/", { name }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.categories }),
  });
}

export function useSetBudget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ year, month, amount }) =>
      api.put(`/api/budget/?year=${year}&month=${month}`, { amount }),
    onSuccess: (_data, { year, month }) =>
      Promise.all([
        qc.invalidateQueries({ queryKey: keys.budget(year, month) }),
        qc.invalidateQueries({ queryKey: ["summary"] }), // budget feeds `remaining`
      ]),
  });
}
