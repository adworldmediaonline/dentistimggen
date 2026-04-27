import { connection } from "next/server"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { prisma } from "@/lib/prisma"

const numberFormatter = new Intl.NumberFormat("en")

export default async function Page() {
  await connection()

  const [usersCount, verifiedUsersCount, adminUsersCount, activeSessionsCount, recentUsers] =
    await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { emailVerified: true } }),
      prisma.user.count({ where: { role: "admin" } }),
      prisma.session.count({ where: { expiresAt: { gt: new Date() } } }),
      prisma.user.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          name: true,
          email: true,
          emailVerified: true,
          role: true,
          createdAt: true,
        },
      }),
    ])

  const stats = [
    {
      label: "Registered users",
      value: usersCount,
      description: "Accounts created in the admin portal",
    },
    {
      label: "Verified emails",
      value: verifiedUsersCount,
      description: "Users allowed to complete protected sign-in",
    },
    {
      label: "Administrators",
      value: adminUsersCount,
      description: "Accounts with dashboard access",
    },
    {
      label: "Active sessions",
      value: activeSessionsCount,
      description: "Non-expired Better Auth sessions",
    },
  ]

  return (
    <main className="flex flex-1 flex-col">
      <div className="@container/main flex flex-1 flex-col gap-6 p-4 md:p-6">
        <section className="grid gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
          {stats.map((stat) => (
            <Card key={stat.label} className="@container/card">
              <CardHeader>
                <CardDescription>{stat.label}</CardDescription>
                <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
                  {numberFormatter.format(stat.value)}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {stat.description}
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
          <Card id="users">
            <CardHeader>
              <CardTitle>Recent users</CardTitle>
              <CardDescription>
                Live Better Auth users from your Prisma Postgres database.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {recentUsers.length > 0 ? (
                <div className="divide-y divide-border rounded-3xl border">
                  {recentUsers.map((user) => (
                    <div
                      key={user.id}
                      className="grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-center"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">{user.name}</p>
                        <p className="truncate text-sm text-muted-foreground">{user.email}</p>
                      </div>
                      <div className="flex flex-wrap gap-2 sm:justify-end">
                        <Badge variant={user.role === "admin" ? "default" : "outline"}>
                          {user.role ?? "user"}
                        </Badge>
                        <Badge variant={user.emailVerified ? "secondary" : "destructive"}>
                          {user.emailVerified ? "Verified" : "Pending verification"}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-3xl border border-dashed p-8 text-center">
                  <p className="font-medium">No users yet</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    The first verified registration will become the initial admin.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card id="access">
            <CardHeader>
              <CardTitle>Access policy</CardTitle>
              <CardDescription>
                Dashboard access is limited to verified administrators.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="rounded-3xl bg-muted/60 p-4">
                <p className="font-medium">First user bootstrap</p>
                <p className="mt-1 text-muted-foreground">
                  When the first account is created, it is automatically promoted to admin.
                </p>
              </div>
              <div className="rounded-3xl bg-muted/60 p-4">
                <p className="font-medium">Email verification required</p>
                <p className="mt-1 text-muted-foreground">
                  Email/password users must verify their OTP before entering this dashboard.
                </p>
              </div>
              <div className="rounded-3xl bg-muted/60 p-4">
                <p className="font-medium">OAuth ready</p>
                <p className="mt-1 text-muted-foreground">
                  Google sign-in is enabled automatically when OAuth credentials are present.
                </p>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  )
}
