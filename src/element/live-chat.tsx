import "./live-chat.css";
import { FormattedMessage } from "react-intl";
import { EventKind, NostrEvent, NostrLink, ParsedZap, TaggedNostrEvent } from "@snort/system";
import { useEventReactions } from "@snort/system-react";
import { unixNow } from "@snort/shared";
import { useMemo } from "react";

import { Icon } from "./icon";
import Spinner from "./spinner";
import { Text } from "./text";
import { Profile } from "./profile";
import { ChatMessage } from "./chat-message";
import { Goal } from "./goal";
import { Badge } from "./badge";
import { WriteMessage } from "./write-message";
import useEmoji, { packId } from "@/hooks/emoji";
import { useLiveChatFeed } from "@/hooks/live-chat";
import { useMutedPubkeys } from "@/hooks/lists";
import { useBadges } from "@/hooks/badges";
import { useLogin } from "@/hooks/login";
import { useAddress } from "@/hooks/event";
import { formatSats } from "@/number";
import { LIVE_STREAM_CHAT, WEEK } from "@/const";
import { findTag, getHost, getTagValues, uniqBy } from "@/utils";
import { TopZappers } from "./top-zappers";

export interface LiveChatOptions {
  canWrite?: boolean;
  showHeader?: boolean;
}

function BadgeAward({ ev }: { ev: NostrEvent }) {
  const badge = findTag(ev, "a") ?? "";
  const [k, pubkey, d] = badge.split(":");
  const awardees = getTagValues(ev.tags, "p");
  const event = useAddress(Number(k), pubkey, d);
  return (
    <div className="badge-award">
      {event && <Badge ev={event} />}
      <p>awarded to</p>
      <div className="badge-awardees">
        {awardees.map(pk => (
          <Profile key={pk} pubkey={pk} />
        ))}
      </div>
    </div>
  );
}

export function LiveChat({
  link,
  ev,
  goal,
  options,
  height,
}: {
  link: NostrLink;
  ev?: NostrEvent;
  goal?: NostrEvent;
  options?: LiveChatOptions;
  height?: number;
}) {
  const host = getHost(ev);
  const feed = useLiveChatFeed(link, goal ? [goal.id] : undefined);
  const login = useLogin();
  const started = useMemo(() => {
    const starts = findTag(ev, "starts");
    return starts ? Number(starts) : unixNow() - WEEK;
  }, [ev]);
  const { badges, awards } = useBadges(host, started);
  const mutedPubkeys = useMemo(() => {
    return new Set(getTagValues(login?.muted.tags ?? [], "p"));
  }, [login]);
  const hostMutedPubkeys = useMutedPubkeys(host, true);
  const userEmojiPacks = login?.emojis ?? [];
  const channelEmojiPacks = useEmoji(host);
  const allEmojiPacks = useMemo(() => {
    return uniqBy(userEmojiPacks.concat(channelEmojiPacks), packId);
  }, [userEmojiPacks, channelEmojiPacks]);

  const reactions = useEventReactions(link, feed.reactions);
  const events = useMemo(() => {
    const extra = [];
    const starts = findTag(ev, "starts");
    if (starts) {
      extra.push({ kind: -1, created_at: Number(starts) } as TaggedNostrEvent);
    }
    const ends = findTag(ev, "ends");
    if (ends) {
      extra.push({ kind: -2, created_at: Number(ends) } as TaggedNostrEvent);
    }
    return [...feed.messages, ...feed.reactions, ...awards, ...extra]
      .sort((a, b) => b.created_at - a.created_at);
  }, [feed.messages, feed.reactions, awards]);

  const filteredEvents = useMemo(() => {
    return events.filter(e => !mutedPubkeys.has(e.pubkey) && !hostMutedPubkeys.has(e.pubkey));
  }, [events, mutedPubkeys, hostMutedPubkeys]);

  return (
    <div className="live-chat" style={height ? { height: `${height}px` } : {}}>
      {(options?.showHeader ?? true) && (
        <div className="header">
          <h2 className="title">
            <FormattedMessage defaultMessage="Stream Chat" id="BGxpTN" />
          </h2>
          <Icon
            name="link"
            className="secondary"
            size={32}
            onClick={() => window.open(`/chat/${link.encode()}?chat=true`, "_blank", "popup,width=400,height=800")}
          />
        </div>
      )}
      {reactions.zaps.length > 0 && (
        <div className="top-zappers">
          <h3>
            <FormattedMessage defaultMessage="Top zappers" id="wzWWzV" />
          </h3>
          <div className="top-zappers-container">
            <TopZappers zaps={reactions.zaps} />
          </div>
          {goal && <Goal ev={goal} />}
        </div>
      )}
      <div className="messages">
        {filteredEvents.map(a => {
          switch (a.kind) {
            case -1:
            case -2: {
              return <b className="border px-3 py-2 text-center border-gray-2 rounded-xl bg-primary uppercase">
                {a.kind === -1 ? <FormattedMessage defaultMessage="Stream Started" id="5tM0VD" />
                  : <FormattedMessage defaultMessage="Stream Ended" id="jkAQj5" />}
              </b>;
            }
            case EventKind.BadgeAward: {
              return <BadgeAward ev={a} />;
            }
            case LIVE_STREAM_CHAT: {
              return (
                <ChatMessage
                  badges={badges}
                  emojiPacks={allEmojiPacks}
                  streamer={host}
                  ev={a}
                  key={a.id}
                  related={feed.reactions}
                />
              );
            }
            case EventKind.ZapReceipt: {
              const zap = reactions.zaps.find(b => b.id === a.id && b.receiver === host);
              if (zap) {
                return <ChatZap zap={zap} key={a.id} />;
              }
            }
          }
          return null;
        })}
        {feed.messages.length === 0 && <Spinner />}
      </div>
      {(options?.canWrite ?? true) && (
        <div className="write-message">
          {login ? (
            <WriteMessage emojiPacks={allEmojiPacks} link={link} />
          ) : (
            <p>
              <FormattedMessage defaultMessage="Please login to write messages!" id="RXQdxR" />
            </p>
          )}
        </div>
      )}
    </div>
  );
}

const BIG_ZAP_THRESHOLD = 50_000;

function ChatZap({ zap }: { zap: ParsedZap }) {
  if (!zap.valid) {
    return null;
  }
  const isBig = zap.amount >= BIG_ZAP_THRESHOLD;

  return (
    <div className={`zap-container ${isBig ? "big-zap" : ""}`}>
      <div className="flex gap-1 items-center">
        <Icon name="zap-filled" className="text-zap" />
        <FormattedMessage
          defaultMessage="<s>{person}</s> zapped <s>{amount}</s> sats"
          id="q+zTWM"
          values={{
            s: (c) => <span className="text-zap">{c}</span>,
            person: (
              <Profile
                pubkey={zap.anonZap ? "anon" : zap.sender ?? ""}
                options={{
                  showAvatar: !zap.anonZap
                }}
              />
            ),
            amount: <span className="zap-amount">{formatSats(zap.amount)}</span>,
          }}
        />
      </div>
      {zap.content && <Text content={zap.content} tags={[]} />}
    </div>
  );
}
