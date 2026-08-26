"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlertCircle } from "lucide-react";
import { LogoUploader } from "./logo-uploader";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const CATEGORY_OPTIONS = [
  { slug: "ai", label: "AI" },
  { slug: "apps", label: "Apps" },
  { slug: "startups", label: "Startups" },
  { slug: "games", label: "Games" },
  { slug: "websites", label: "Websites" },
  { slug: "creators", label: "Creators" },
  { slug: "products", label: "Products" },
  { slug: "music", label: "Music" },
] as const;

const formSchema = z.object({
  name: z.string().min(2, "At least 2 characters").max(60, "Max 60"),
  websiteUrl: z
    .string()
    .url("Must be a valid URL")
    .or(z.literal(""))
    .optional(),
  description: z
    .string()
    .max(280, "Max 280 characters")
    .or(z.literal(""))
    .optional(),
  logoUrl: z.string().url().nullable().optional(),
  categorySlugs: z.array(z.string()).max(8).optional(),
});

type FormValues = z.infer<typeof formSchema>;

export function ListingForm({ mode }: { mode: "create" | "edit" }) {
  const router = useRouter();
  const [submitting, setSubmitting] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      websiteUrl: "",
      description: "",
      logoUrl: null,
      categorySlugs: [],
    },
  });

  const descValue = form.watch("description") ?? "";
  const selectedCats = form.watch("categorySlugs") ?? [];

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    setServerError(null);
    try {
      const res = await fetch("/api/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: values.name,
          websiteUrl: values.websiteUrl || undefined,
          description: values.description || undefined,
          logoUrl: values.logoUrl || undefined,
          categorySlugs: values.categorySlugs,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
      }
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  function toggleCategory(slug: string) {
    const cur = new Set(selectedCats);
    if (cur.has(slug)) cur.delete(slug);
    else cur.add(slug);
    form.setValue("categorySlugs", Array.from(cur), { shouldValidate: true });
  }

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className="space-y-6"
      noValidate
    >
      {serverError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-danger"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{serverError}</span>
        </div>
      )}

      <Field
        label="Name"
        htmlFor="name"
        error={form.formState.errors.name?.message}
        required
      >
        <input
          id="name"
          type="text"
          autoComplete="off"
          className={inputCls(!!form.formState.errors.name)}
          {...form.register("name")}
        />
      </Field>

      <Field
        label="Website"
        htmlFor="websiteUrl"
        error={form.formState.errors.websiteUrl?.message}
        hint="Optional. Include https://"
      >
        <input
          id="websiteUrl"
          type="url"
          autoComplete="off"
          className={inputCls(!!form.formState.errors.websiteUrl)}
          {...form.register("websiteUrl")}
        />
      </Field>

      <Field
        label="Description"
        htmlFor="description"
        error={form.formState.errors.description?.message}
        hint={`${descValue.length}/280`}
      >
        <textarea
          id="description"
          rows={3}
          className={cn(inputCls(!!form.formState.errors.description), "resize-none")}
          {...form.register("description")}
        />
      </Field>

      <Field label="Logo" htmlFor="logo-drop" hint="Optional but recommended">
        <LogoUploader
          value={form.watch("logoUrl") ?? null}
          onChange={(url) => form.setValue("logoUrl", url, { shouldValidate: true })}
        />
      </Field>

      <Field label="Categories" hint="Up to 8" htmlFor="">
        <div className="flex flex-wrap gap-2">
          {CATEGORY_OPTIONS.map((c) => {
            const active = selectedCats.includes(c.slug);
            return (
              <button
                key={c.slug}
                type="button"
                onClick={() => toggleCategory(c.slug)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm transition-colors",
                  active
                    ? "border-primary bg-primary text-primary-fg"
                    : "border-border bg-surface text-fg-muted hover:border-primary hover:text-fg",
                )}
                aria-pressed={active}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </Field>

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" loading={submitting}>
          {mode === "create" ? "Create listing" : "Save changes"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.push("/dashboard")}
          disabled={submitting}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label htmlFor={htmlFor} className="text-sm font-medium text-fg">
          {label}
          {required && <span className="ml-0.5 text-danger">*</span>}
        </label>
        {hint && <span className="font-mono text-xs text-fg-subtle">{hint}</span>}
      </div>
      {children}
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

const inputCls = (hasError: boolean) =>
  cn(
    "block w-full rounded-md border bg-bg px-3 py-2 text-fg placeholder-fg-subtle transition-colors",
    "focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30",
    hasError ? "border-danger" : "border-border",
  );
