import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 bg-ink-50 px-6 py-16 dark:bg-ink-950">
      <h1 className="text-xl font-semibold text-ink-950 dark:text-ink-50">Personal Money Manager</h1>
      <LoginForm />
    </div>
  );
}
