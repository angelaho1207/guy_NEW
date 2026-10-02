import { notFound } from 'next/navigation';
import { AVATAR_GRADIENTS, EMPTY_SHARED_VALUE } from '@guy/shared';
import { ThemeToggle } from '@/components/ThemeToggle';

/**
 * Every component, every state, on one page.
 *
 * This exists because the app is unreviewable otherwise. A real account that
 * has not met anyone shows empty states on four screens out of six, so most of
 * the design could only be seen by first arranging to meet someone. Here it is
 * all at once, in whichever theme is on.
 *
 * Not linked from anywhere, and it refuses to render in production. It is a
 * workshop, not a feature: nothing here talks to the database, and none of the
 * controls do anything.
 */

export const dynamic = 'force-dynamic';

export default function PreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound();

  return (
    <>
      <h1>Preview</h1>
      <p className="lede">
        Every piece of the interface, with nothing behind it. Flip the theme and
        everything here flips with it — that is the thing worth checking.
      </p>

      <ThemeToggle />

      <div className="eyebrow" style={{ marginTop: 28 }}>
        Display type
      </div>
      <div className="card">
        <h1 style={{ marginTop: 0 }}>Contacts</h1>
        <h1 className="section-title" style={{ marginBottom: 12 }}>
          Who else is here
        </h1>
        <h2 style={{ marginTop: 0 }}>Share with Marcus?</h2>
        <h3>Section heading</h3>
        <p style={{ margin: 0 }}>
          Body copy at sixteen pixels. Both of you confirm before anything is
          shared, and the code itself is useless two minutes from now.
        </p>
        <p className="tiny">Label and caption, thirteen pixels.</p>
        <div className="eyebrow">Eyebrow label</div>
      </div>

      <div className="eyebrow" style={{ marginTop: 28 }}>
        Avatars — one per person, chosen from their id
      </div>
      <div className="card">
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {AVATAR_GRADIENTS.map((grad) => (
            <span className="avatar" key={grad} data-grad={grad}>
              {grad.slice(0, 2).toUpperCase()}
            </span>
          ))}
        </div>
      </div>

      <div className="eyebrow" style={{ marginTop: 28 }}>
        Pills
      </div>
      <div className="card">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span className="pill">Plain</span>
          <span className="pill" data-tone="accent">
            Accent
          </span>
          <span className="pill" data-tone="celebrate">
            Wants follow-up
          </span>
          <span className="pill" data-tone="warn">
            24s
          </span>
          <span className="pill" data-tone="go">
            Connected
          </span>
          <span className="badge">3</span>
        </div>
      </div>

      <div className="eyebrow" style={{ marginTop: 28 }}>
        Buttons
      </div>
      <div className="card">
        <div className="btn-row">
          <button type="button" className="btn btn-primary">
            Confirm
          </button>
          <button type="button" className="btn btn-quiet">
            Not now
          </button>
          <button type="button" className="btn btn-danger">
            Delete
          </button>
          <button type="button" className="btn btn-primary btn-sm">
            Small
          </button>
        </div>
        <button type="button" className="btn btn-primary btn-tall" style={{ marginTop: 12 }}>
          Sign in
        </button>
      </div>

      <div className="eyebrow" style={{ marginTop: 28 }}>
        The countdown meter
      </div>
      <div className="card">
        {[100, 78, 42, 8].map((pct) => (
          <div className="meter" style={{ margin: '10px 0' }} key={pct}>
            <span style={{ width: `${pct}%` }} />
          </div>
        ))}
      </div>

      <div className="eyebrow" style={{ marginTop: 28 }}>
        A person in a list
      </div>
      <div className="card card-tight person">
        <span className="avatar" data-grad="periwinkle">
          PR
        </span>
        <span className="grow">
          <span style={{ fontSize: 16, fontWeight: 600 }}>Priya Raghunathan</span>
          <span className="tiny">Right here</span>
        </span>
        <button type="button" className="btn btn-primary">
          Connect
        </button>
      </div>
      <div className="card card-tight person">
        <span className="avatar" data-grad="dusk">
          TG
        </span>
        <span className="grow">
          <span style={{ fontSize: 16, fontWeight: 600 }}>Tobias Grant</span>
          <span className="tiny">Within a minute of you</span>
        </span>
        <span className="pill">Already</span>
      </div>

      <div className="eyebrow" style={{ marginTop: 28 }}>
        The confirmation prompt, which is the loud one
      </div>
      <div className="card glowing">
        <div className="row-head">
          <h2 style={{ margin: 0, fontSize: 30 }}>Share with Marcus?</h2>
          <span className="pill" data-tone="warn">
            24s
          </span>
        </div>
        <div className="meter" style={{ margin: '12px 0' }}>
          <span style={{ width: '78%' }} />
        </div>
        <p className="tiny" style={{ marginTop: 0 }}>
          They will get whatever you are sharing right now, and you will get
          whatever they are sharing.
        </p>
        <div className="btn-row" style={{ marginTop: 4, flexWrap: 'nowrap' }}>
          <button type="button" className="btn btn-primary" style={{ flex: 1 }}>
            Confirm
          </button>
          <button type="button" className="btn btn-quiet">
            Not now
          </button>
        </div>
      </div>

      <div className="eyebrow" style={{ marginTop: 28 }}>
        A shared profile, including the load-bearing dash
      </div>
      <div className="card">
        <div className="detail">
          <span className="field-label" style={{ margin: 0 }}>
            School
          </span>
          <span>MIT</span>
        </div>
        <div className="detail">
          <span className="field-label" style={{ margin: 0 }}>
            Hometown
          </span>
          <span className="blank" title="Shared, but they left it blank">
            {EMPTY_SHARED_VALUE}
          </span>
        </div>
        <div className="detail">
          <span className="field-label" style={{ margin: 0 }}>
            LinkedIn
          </span>
          <a className="handle-link" href="https://www.linkedin.com/in/example">
            linkedin.com/in/priya-raghunathan
          </a>
        </div>
        <p className="tiny" style={{ marginBottom: 0 }}>
          She shares her hometown but has not filled it in, so it reads as a
          dash. Her phone is absent entirely, because she withheld it — that
          difference has to stay visible.
        </p>
      </div>

      <div className="eyebrow" style={{ marginTop: 28 }}>
        Form fields
      </div>
      <div className="card">
        <label className="field">
          <span className="field-label">Username</span>
          <input type="text" defaultValue="angelaho" />
        </label>
        <label className="field">
          <span className="field-label">Things I am currently into</span>
          <textarea rows={3} defaultValue={'urban planning\nbouldering\nBach'} />
        </label>
        <div className="field-head">
          <span className="field-label" style={{ margin: 0 }}>
            Hometown
          </span>
          <span className="share" data-on="true">
            Sharing
          </span>
        </div>
      </div>

      <div className="eyebrow" style={{ marginTop: 28 }}>
        The hero wash — a gradient, not a slab
      </div>
      <div className="hero" style={{ marginTop: 12 }}>
        <span className="hero-mark">Guy.</span>
        <h1 className="hero-title">
          You met.
          <br />
          Now keep it.
        </h1>
      </div>

      <div className="banner" style={{ marginTop: 28 }}>
        A banner, for something the reader needs to know rather than act on.
      </div>
    </>
  );
}
