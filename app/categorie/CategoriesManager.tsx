"use client";

import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmojiPicker } from "./EmojiPicker";

const NO_PARENT = "__none__";

function CategoryRow({
  category,
  indented = false,
}: {
  category: { id: string; name: string; icon: string | null };
  indented?: boolean;
}) {
  const utils = trpc.useUtils();
  const [editOpen, setEditOpen] = useState(false);
  const [icon, setIcon] = useState(category.icon ?? "");

  const updateCategory = trpc.category.update.useMutation({
    onSuccess: () => {
      utils.category.list.invalidate();
      setEditOpen(false);
    },
    onError: (error) => toast.error(error.message || "Impossibile aggiornare l'icona."),
  });

  const deleteCategory = trpc.category.delete.useMutation({
    onSuccess: () => {
      toast.success("Categoria eliminata.");
      utils.category.list.invalidate();
    },
    onError: (error) => toast.error(error.message || "Impossibile eliminare la categoria."),
  });

  return (
    <div className="flex items-center justify-between gap-2">
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogTrigger
          render={
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-0.5 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <span className="shrink-0 text-lg leading-none">{category.icon || "🏷️"}</span>
              <span
                className={`truncate ${indented ? "text-sm text-zinc-600 dark:text-zinc-300" : "font-medium text-zinc-950 dark:text-zinc-50"}`}
              >
                {category.name}
              </span>
            </button>
          }
        />
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Icona · {category.name}</DialogTitle>
          </DialogHeader>
          <EmojiPicker value={icon} onChange={setIcon} />
          <DialogFooter>
            <Button
              onClick={() => updateCategory.mutate({ id: category.id, icon })}
              disabled={updateCategory.isPending}
            >
              {updateCategory.isPending ? "Salvataggio…" : "Salva"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Button
        variant={indented ? "ghost" : "outline"}
        size="sm"
        className="shrink-0"
        disabled={deleteCategory.isPending}
        onClick={() => deleteCategory.mutate({ id: category.id })}
      >
        Elimina
      </Button>
    </div>
  );
}

export function CategoriesManager() {
  const utils = trpc.useUtils();
  const { data: categories, isLoading } = trpc.category.list.useQuery();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");
  const [parentId, setParentId] = useState(NO_PARENT);

  const topLevel = categories?.filter((c) => !c.parentId) ?? [];
  const childrenOf = (id: string) => categories?.filter((c) => c.parentId === id) ?? [];
  // Base UI's <Select> non deduce l'etichetta dal <SelectItem> selezionato
  // — senza questa mappa, <SelectValue> mostra l'id grezzo invece del testo.
  const parentItems: Record<string, string> = {
    [NO_PARENT]: "Nessuna (categoria principale)",
    ...Object.fromEntries(topLevel.map((c) => [c.id, c.name])),
  };

  const createCategory = trpc.category.create.useMutation({
    onSuccess: () => {
      toast.success("Categoria creata.");
      utils.category.list.invalidate();
      setOpen(false);
      setName("");
      setIcon("");
      setParentId(NO_PARENT);
    },
    onError: (error) => toast.error(error.message || "Impossibile creare la categoria."),
  });

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    createCategory.mutate({ name, icon, parentId: parentId === NO_PARENT ? null : parentId });
  }

  return (
    <div className="flex w-full max-w-xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">Categorie</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button>+ Nuova categoria</Button>} />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nuova categoria</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="category-name">Nome</Label>
                <Input id="category-name" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Icona (opzionale)</Label>
                <EmojiPicker value={icon} onChange={setIcon} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="category-parent">Categoria padre (opzionale)</Label>
                <Select items={parentItems} value={parentId} onValueChange={(value) => setParentId(value ?? NO_PARENT)}>
                  <SelectTrigger id="category-parent" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_PARENT}>Nessuna (categoria principale)</SelectItem>
                    {topLevel.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.icon ? `${category.icon} ` : ""}
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={createCategory.isPending}>
                  {createCategory.isPending ? "Creazione…" : "Crea categoria"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading && <p className="text-sm text-zinc-500 dark:text-zinc-400">Caricamento…</p>}
      {!isLoading && topLevel.length === 0 && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Nessuna categoria ancora — creane una per iniziare a classificare le spese.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {topLevel.map((category) => (
          <Card key={category.id} className="flex flex-col gap-2 p-4">
            <CategoryRow category={category} />
            {childrenOf(category.id).length > 0 && (
              <div className="flex flex-col gap-1 border-l border-zinc-200 pl-3 dark:border-zinc-800">
                {childrenOf(category.id).map((child) => (
                  <CategoryRow key={child.id} category={child} indented />
                ))}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
