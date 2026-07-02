import React from 'react';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { chatOnce, setChatSession } from '../api';
import { loadLastExchange, loadSessionUser, loadSettings, saveLastExchange } from '../settings';
import { ButlerWidget } from './ButlerWidget';

const STATUS_PROMPT =
  'Quick status check from the home-screen widget: confirm you are up and note anything that needs my attention. Reply in plain text, max 40 words, no markdown.';

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
          // The widget runs headless — point at the app's current chat session
          // instead of the module default (which may be a stale, cleared one).
          setChatSession(await loadSessionUser());
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
