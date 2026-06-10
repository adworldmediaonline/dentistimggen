import { redirect } from "next/navigation"
import { Suspense } from "react"

import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { getSession } from "@/lib/auth"

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const session = await getSession()

  if (!session) {
    redirect("/sign-in?callbackUrl=/dashboard")
  }

  if (session.user.role !== "admin") {
    redirect("/unauthorized")
  }

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <AppSidebar
        variant="inset"
        user={{
          name: session.user.name,
          email: session.user.email,
          avatar: session.user.image,
        }}
      />
      <SidebarInset>
        <SiteHeader />
        <Suspense
          fallback={
            <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
              Loading dashboard...
            </div>
          }
        >
          {children}
        </Suspense>
      </SidebarInset>
    </SidebarProvider>
  )
}
