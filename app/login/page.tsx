import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 bg-zinc-50 px-6 py-16 dark:bg-black">
      <h1 className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">Personal Money Manager</h1>
      <LoginForm />
    </div>
  );
}
