import { redirect } from 'next/navigation';

// Redirige /admin/tickets/[id] -> /?ticket=[id] para que la SPA
// abra el detalle del ticket mediante el query param (deep-link desde
// las notificaciones de WhatsApp/correo).
export default async function AdminTicketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/?ticket=${encodeURIComponent(id)}`);
}
