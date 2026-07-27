import React from 'react';
import { Linking, StyleProp, Text, TextStyle } from 'react-native';

// Trailing punctuation is almost always sentence punctuation, not part of the
// URL — but a closing paren can be either, so only trim it when unbalanced.
const URL_RE = /https?:\/\/[^\s<>"]+/gi;

function trimTrailing(url: string): string {
  let out = url;
  while (out.length > 1) {
    const last = out[out.length - 1];
    if ('.,;:!?'.includes(last)) out = out.slice(0, -1);
    else if (last === ')' && !out.includes('(')) out = out.slice(0, -1);
    else break;
  }
  return out;
}

/**
 * Render text with any URLs in it as tappable links.
 *
 * React Native's Text does no linkification of its own, so a link the butler
 * sends — a release download, a search result, anything — used to arrive as
 * dead text: readable, but with no way to open it and nowhere else to get it.
 */
export function LinkifiedText({
  text,
  style,
  linkStyle,
}: {
  text: string;
  style?: StyleProp<TextStyle>;
  linkStyle?: StyleProp<TextStyle>;
}) {
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  URL_RE.lastIndex = 0;
  while ((match = URL_RE.exec(text)) !== null) {
    const url = trimTrailing(match[0]);
    if (match.index > cursor) parts.push(text.slice(cursor, match.index));
    parts.push(
      <Text
        key={`${match.index}-${url}`}
        style={linkStyle}
        onPress={() => {
          Linking.openURL(url).catch(() => {});
        }}
      >
        {url}
      </Text>,
    );
    cursor = match.index + url.length;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <Text style={style}>{parts}</Text>;
}
