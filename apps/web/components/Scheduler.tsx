'use client';

import { useActionState, useState } from 'react';
import { sendMessage, acceptTime } from '@/app/actions';
import { windowsFromApproval, canPropose, chatIsOpen, type OneOnOneStatus } from '@guy/shared';
import { toInstantValue } from '@/lib/dates';

type Message = {
  id: string;
  sender_id: string;
  body: string | null;
  proposed_for: Date | string | null;
  created_at: Date | string;
};

/**
 * The in-chat scheduling window.
 *
 * Scheduling happens by talking, not by calendar sync and not by filling in
 * availability grids. Either person can attach a proposed time to a message,
 * and the other accepts it.
 *
 * The window rules are checked here so the UI can explain itself, and again by
 * the database, which is what enforces them.
 */
export function Scheduler({
  requestId,
  meId,
  peerName,
  status,
  approvedAt,
  scheduledFor,
  messages,
}: {
  requestId: string;
  meId: string;
  peerName: string;
  status: OneOnOneStatus;
  approvedAt: string | null;
  scheduledFor: string | null;
  messages: Message[];
}) {
  const [sendState, send, sending] = useActionState(sendMessage, null);
  const [acceptState, accept, accepting] = useActionState(acceptTime, null);
  const [proposing, setProposing] = useState(false);

  const windows = approvedAt ? windowsFromApproval(new Date(approvedAt)) : null;
  const open = chatIsOpen(status, windows);

  return (
    <>
      {scheduledFor && (
        <div className="banner">
          <strong>
            {new Date(scheduledFor).toLocaleString(undefined, {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })}
          </strong>{' '}
          with {peerName}. Either of you can still propose a different time
          while the window is open.
        </div>
      )}

      {windows && !scheduledFor && open && (
        <p className="tiny">
          Agree on a time before{' '}
          {windows.expiresAt.toLocaleDateString(undefined, {
            weekday: 'long',
            month: 'short',
            day: 'numeric',
          })}
          , or this expires and either of you can start again. The meeting
          itself can be any time up to{' '}
          {windows.outerLimitAt.toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
          })}
          .
        </p>
      )}

      <div className="card">
        {messages.length === 0 && (
          <p className="muted" style={{ margin: 0 }}>
            No messages yet.
          </p>
        )}

        {messages.map((m) => {
          const mine = m.sender_id === meId;
          const proposed = m.proposed_for ? new Date(m.proposed_for) : null;
          const verdict =
            proposed && windows ? canPropose(proposed, windows) : null;

          return (
            <div className="msg" key={m.id} data-mine={mine}>
              {m.body && <div>{m.body}</div>}
              {proposed && (
                <div className="proposal">
                  <div className="muted">Proposed</div>
                  <div>
                    {proposed.toLocaleString(undefined, {
                      weekday: 'long',
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </div>
                  {!mine && open && verdict?.ok && (
                    <form action={accept} style={{ marginTop: 8 }}>
                      <input type="hidden" name="request_id" value={requestId} />
                      <input
                        type="hidden"
                        name="when"
                        value={toInstantValue(m.proposed_for)}
                      />
                      <button className="btn btn-sm btn-primary" disabled={accepting}>
                        Accept this time
                      </button>
                    </form>
                  )}
                  {verdict && !verdict.ok && (
                    <div className="tiny" style={{ color: 'var(--danger)' }}>
                      {verdict.reason}
                    </div>
                  )}
                </div>
              )}
              <div className="tiny" style={{ marginTop: 6 }}>
                {new Date(m.created_at).toLocaleString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </div>
            </div>
          );
        })}
      </div>

      {acceptState && 'error' in acceptState && acceptState.error && (
        <p className="tiny" style={{ color: 'var(--danger)' }}>
          {acceptState.error}
        </p>
      )}

      {open ? (
        <form action={send} className="card">
          <label className="field">
            <span className="field-label">Message</span>
            <textarea
              name="body"
              style={{ minHeight: 64 }}
              placeholder="Thursday afternoon any good?"
            />
          </label>

          {proposing && (
            <label className="field">
              <span className="field-label">Propose a time</span>
              <input type="datetime-local" name="proposed_for" />
            </label>
          )}

          <div className="btn-row">
            <button className="btn btn-primary" disabled={sending}>
              Send
            </button>
            <button
              type="button"
              className="btn btn-quiet"
              onClick={() => setProposing((p) => !p)}
            >
              {proposing ? 'Just a message' : 'Propose a time'}
            </button>
          </div>

          {sendState && 'error' in sendState && sendState.error && (
            <p className="tiny" style={{ color: 'var(--danger)', marginBottom: 0 }}>
              {sendState.error}
            </p>
          )}
        </form>
      ) : (
        <div className="empty">
          {status === 'pending'
            ? 'The chat opens once they approve.'
            : 'This window has closed. Either of you can send a new request.'}
        </div>
      )}
    </>
  );
}
