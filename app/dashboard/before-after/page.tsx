import { BeforeAfterGenerator } from "@/components/before-after/before-after-generator"

export default function BeforeAfterPage() {
  return (
    <main className="flex flex-1 flex-col">
      <div className="@container/main flex flex-1 flex-col gap-6 p-4 md:p-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Before & after images</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Generate Puter AI after-treatment teeth previews from admin-uploaded before
            images and review the result without leaving the dashboard.
          </p>
        </div>
        <BeforeAfterGenerator />
      </div>
    </main>
  )
}
