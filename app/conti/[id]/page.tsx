import { LogoutButton } from "../../logout-button";
import { BottomNav } from "../../BottomNav";
import { AccountMovementsClient } from "./AccountMovementsClient";

export default async function AccountDetailPage({ params }: PageProps<"/conti/[id]">) {
  const { id } = await params;
  return (
    <div className="flex flex-1 flex-col items-center gap-6 bg-ink-50 px-6 py-16 pb-24 dark:bg-ink-950">
      <AccountMovementsClient accountId={id} />
      <BottomNav logoutSlot={<LogoutButton />} />
    </div>
  );
}
