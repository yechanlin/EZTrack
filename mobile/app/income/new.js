import { useRouter } from "expo-router";

import { useCreateIncome } from "../../src/api/hooks";
import IncomeForm from "../../src/components/IncomeForm";

/**
 * Add money to the balance.
 *
 * This flow is why the balance is reconstructible at all. Without an Income ledger,
 * the balance could only ever go down, and there'd be no record of where the
 * starting number came from — so a balance that drifted could never be repaired,
 * only overwritten.
 */
export default function AddIncomeScreen() {
  const router = useRouter();
  const create = useCreateIncome();

  return (
    <IncomeForm
      submitLabel="Add money"
      submitting={create.isPending}
      error={create.error}
      onSubmit={(body) => create.mutate(body, { onSuccess: () => router.back() })}
    />
  );
}
