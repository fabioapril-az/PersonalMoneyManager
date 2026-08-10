"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ChangePasswordForm() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const changePassword = trpc.user.changePassword.useMutation({
    onSuccess: () => {
      toast.success("Password aggiornata.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (error) => {
      toast.error(error.message || "Impossibile aggiornare la password.");
    },
  });

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (newPassword !== confirmPassword) {
      toast.error("Le due password non coincidono.");
      return;
    }

    changePassword.mutate({ currentPassword, newPassword });
  }

  function handleCancel() {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    router.push("/");
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="currentPassword">Password attuale</Label>
        <Input
          id="currentPassword"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="newPassword">Nuova password</Label>
        <Input
          id="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={8}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="confirmPassword">Ripeti la nuova password</Label>
        <Input
          id="confirmPassword"
          type="password"
          autoComplete="new-password"
          minLength={8}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={changePassword.isPending}>
          {changePassword.isPending ? "Aggiornamento…" : "Aggiorna password"}
        </Button>
        <Button type="button" variant="outline" onClick={handleCancel} disabled={changePassword.isPending}>
          Annulla
        </Button>
      </div>
    </form>
  );
}
