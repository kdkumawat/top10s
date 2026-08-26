import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="grid min-h-dvh place-items-center bg-bg p-4">
      <SignIn
        appearance={{
          elements: {
            rootBox: "mx-auto",
            card: "bg-surface border border-border shadow-lg",
            headerTitle: "text-fg",
            headerSubtitle: "text-fg-muted",
            socialButtonsBlockButton:
              "bg-surface-elevated border-border text-fg hover:bg-surface",
            formButtonPrimary: "bg-primary hover:bg-primary-hover",
            formFieldInput: "bg-bg border-border text-fg",
            formFieldLabel: "text-fg-muted",
            footerActionLink: "text-primary hover:text-primary-hover",
          },
        }}
      />
    </div>
  );
}
