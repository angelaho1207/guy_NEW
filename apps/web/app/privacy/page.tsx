import Link from 'next/link';
import { CONNECT_TOKEN_TTL_SECONDS } from '@guy/shared';

export const dynamic = 'force-dynamic';

/**
 * The privacy policy.
 *
 * Written to be true rather than to be safe, which means it is specific: it says
 * what the nearby feature does with a location, how long a presence row lives,
 * and that deleting an account takes other people's notes about you with it.
 * Both app stores require a reachable policy before they will review anything,
 * and an app about consent cannot have a vague one.
 *
 * If any of this stops being true, this page is wrong and has to change. The
 * numbers in it come from the same constants the code uses, so at least those
 * cannot drift.
 */
export default function PrivacyPage() {
  return (
    <>
      <h1 style={{ marginTop: 24 }}>Privacy</h1>
      <p className="lede">
        What Guy stores, who can see it, and how to make it stop. Last updated 2
        October 2026.
      </p>

      <h2>The short version</h2>
      <div className="card">
        <p style={{ marginTop: 0 }}>
          Nothing about you reaches another person until you have both tapped
          confirm, standing in the same place. Every field on your profile has
          its own switch, and turning one off hides it from everyone you are
          already connected to, immediately.
        </p>
        <p style={{ marginBottom: 0 }}>
          We do not sell anything, we do not advertise, and there is no tracking
          beyond what is described here.
        </p>
      </div>

      <h2>What we store</h2>
      <div className="card">
        <div className="detail">
          <span className="field-label" style={{ margin: 0 }}>
            Your profile
          </span>
          <span>
            Whatever you type into it. First and last name are required; nothing
            else is. Each field is shared only while its switch is on.
          </span>
        </div>
        <div className="detail">
          <span className="field-label" style={{ margin: 0 }}>
            Your email
          </span>
          <span>
            Held so you can sign in and recover the account. It is never shown to
            anyone you connect with and is not a profile field, so it cannot be
            shared by accident.
          </span>
        </div>
        <div className="detail">
          <span className="field-label" style={{ margin: 0 }}>
            Connections
          </span>
          <span>
            Who you connected with, when, and how you met. Plus whatever you
            write in your private notes, which the other person can never see.
          </span>
        </div>
        <div className="detail">
          <span className="field-label" style={{ margin: 0 }}>
            Connect codes
          </span>
          <span>
            A code lasts {CONNECT_TOKEN_TTL_SECONDS} seconds and works once.
            Spent and expired codes are deleted on a schedule.
          </span>
        </div>
      </div>

      <h2>Location, specifically</h2>
      <div className="card">
        <p style={{ marginTop: 0 }}>
          The nearby feature only runs while you are looking at the Connect
          screen and have pressed the button that turns it on. While it is on:
        </p>
        <ul>
          <li>
            A single coarse position is held, along with the time it was last
            seen. It is overwritten each time, never appended to, so there is no
            history and no trail.
          </li>
          <li>
            It is deleted when you leave the screen, and expires by itself after
            45 seconds if your phone stops reporting — so a lost signal cannot
            leave you on a list somewhere you are not.
          </li>
          <li>
            Nobody can read it. The only thing other people can learn is your
            name and a rough sense of how far away you are, and only people who
            have that same screen open at that same moment within about 150
            metres.
          </li>
          <li>We do not log it, store it anywhere else, or look at it later.</li>
        </ul>
        <p style={{ marginBottom: 0 }}>
          Say no to the location prompt and nearby simply does not work for you.
          You can still connect with a code or a QR scan.
        </p>
      </div>

      <h2>What other people see</h2>
      <div className="card">
        <p style={{ marginTop: 0 }}>
          Only the fields you currently have switched on, and only people you
          have connected with. This is enforced by the database rather than by
          the app: a field with its switch off cannot be read by anyone, through
          any route.
        </p>
        <p style={{ marginBottom: 0 }}>
          A field that is shared but empty shows as a dash. A field you have
          withheld is not shown at all — the difference is deliberate, so
          nobody has to guess which it was.
        </p>
      </div>

      <h2>Deleting everything</h2>
      <div className="card">
        <p style={{ marginTop: 0 }}>
          There is a button on your profile. It removes your profile, your
          sharing settings, your connections in both directions, your reminders,
          your meeting requests, and your account itself.
        </p>
        <p style={{ marginBottom: 0 }}>
          It also removes the private notes other people wrote about you. That
          is a deliberate choice rather than an oversight: a note about someone
          who has asked to be forgotten is still a record of them.
        </p>
      </div>

      <h2>Who else is involved</h2>
      <div className="card">
        <p style={{ margin: 0 }}>
          The app runs on Vercel and the database is Supabase, both in the United
          States. They hold this data on our behalf in order to run the service,
          and for no other purpose.
        </p>
      </div>

      <p className="tiny" style={{ marginTop: 24 }}>
        <Link className="handle-link" href="/connect">
          Back to the app
        </Link>
      </p>
    </>
  );
}
