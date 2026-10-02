import Link from 'next/link';
import { asUser } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { ConfirmPrompt } from '@/components/ConfirmPrompt';
import { PendingWatcher } from '@/components/PendingWatcher';
import { ScannedCode } from '@/components/ScannedCode';
import { toInstantValue } from '@/lib/dates';

/**
 * Where a scanned QR code lands.
 *
 * This is the short path, and the reason the QR holds a URL rather than a bare
 * code: a phone's own camera app recognises a link and offers to open it, with
 * no app running and no scanner involved. From there it is one tap — Confirm.
 *
 * Redemption happens from the client on arrival rather than while this page
 * renders. A GET that consumes a single-use code would be the wrong shape: a
 * link preview, a prefetch or an accidental reload would spend someone's code
 * without anyone meaning to.
 */

export const dynamic = 'force-dynamic';

type Pending = {
  id: string;
  expires_at: Date;
  you_confirmed: boolean;
  peer_name: string;
};

export default async function ScannedCodePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const me = await requireUser();
  const { code } = await params;

  // Prompts already waiting, so a second scan of the same code shows the prompt
  // it already opened rather than looking like it failed.
  const pending = await asUser<Pending>(
    me.user_id,
    `select
       e.id,
       e.expires_at,
       case when e.initiator_id = $1 then e.initiator_confirmed_at is not null
            else e.responder_confirmed_at is not null end as you_confirmed,
       public.exchange_peer_name(e.id) as peer_name
     from public.exchanges e
     where e.state = 'pending'
       and e.expires_at > now()
       and (e.initiator_id = $1 or e.responder_id = $1)
     order by e.created_at desc`,
    [me.user_id],
  );

  return (
    <>
      <PendingWatcher />

      <h1 className="section-title" style={{ marginTop: 24 }}>
        Connecting
      </h1>

      {pending.length === 0 && <ScannedCode code={decodeURIComponent(code)} />}

      {pending.map((p) => (
        <ConfirmPrompt
          key={p.id}
          exchangeId={p.id}
          peerName={p.peer_name}
          expiresAt={toInstantValue(p.expires_at)}
          youConfirmed={p.you_confirmed}
        />
      ))}

      <p className="tiny" style={{ marginTop: 20 }}>
        <Link className="handle-link" href="/connect">
          Back to Connect
        </Link>
      </p>
    </>
  );
}
