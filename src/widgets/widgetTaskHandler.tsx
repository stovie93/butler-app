import React from 'react';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { chatOnce, setChatSession } from '../api';
import { loadLastExchange, loadSettings, saveLastExchange } from '../settings';
import { ButlerWidget } from './ButlerWidget';

const STATUS_PROMPT =
  'Quick status check from the home-screen widget: confirm you are up and note anything that needs my attention. Reply in plain text, max 40 words, no markdown.';

// The widget's status pings live on their own gateway session, apart from the
// Chat tab's. A health check needs no conversation history, and keeping it
// separate means these throwaway pings never pollute — or race, since the
// widget runs in its own headless process — the real chat's server-side context.
const WIDGET_SESSION = 'butler-widget';

async function lastText(): Promise<string> {
  const last = await loadLastExchange();
  return last?.reply || 'Tap to talk to your computer.';
}

export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED':
      props.renderWidget(<ButlerWidget text={await lastText()} />);
      break;

    case 'WIDGET_CLICK':
      if (props.clickAction === 'STATUS') {
        props.renderWidget(<ButlerWidget text="Checking on the computer…" loading />);
        try {
          const settings = await loadSettings();
          // Use the widget's own dedicated session (never the Chat tab's), so a
          // status ping neither pollutes nor races the real conversation.
          setChatSession(WIDGET_SESSION);
          const reply = await chatOnce(settings, STATUS_PROMPT);
          await saveLastExchange('status', reply);
          props.renderWidget(<ButlerWidget text={reply} />);
        } catch (err) {
          props.renderWidget(
            <ButlerWidget
              text={`⚠ ${err instanceof Error ? err.message : String(err)}`}
            />,
          );
        }
      }
      break;

    default:
      break;
  }
}
