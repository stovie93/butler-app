import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';

export function ButlerWidget(props: { text: string; loading?: boolean }) {
  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: '#0e1116',
        borderRadius: 20,
        flexDirection: 'column',
        padding: 14,
      }}
    >
      <FlexWidget
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: 'match_parent',
        }}
      >
        <TextWidget
          text="🤖 Butler"
          style={{ fontSize: 14, fontWeight: 'bold', color: '#e8ecf3' }}
        />
        <FlexWidget
          clickAction="STATUS"
          style={{
            backgroundColor: '#222937',
            borderRadius: 12,
            paddingHorizontal: 10,
            paddingVertical: 5,
          }}
        >
          <TextWidget
            text={props.loading ? '…' : '⟳ Status'}
            style={{ fontSize: 12, color: '#8b93a3' }}
          />
        </FlexWidget>
      </FlexWidget>

      <FlexWidget
        clickAction="OPEN_APP"
        style={{
          flex: 1,
          width: 'match_parent',
          flexDirection: 'column',
          justifyContent: 'center',
          marginTop: 8,
        }}
      >
        <TextWidget
          text={props.text}
          maxLines={4}
          style={{ fontSize: 13, color: '#aeb6c4' }}
        />
      </FlexWidget>

      <FlexWidget
        clickAction="OPEN_APP"
        style={{
          width: 'match_parent',
          backgroundColor: '#4f8cff',
          borderRadius: 14,
          paddingVertical: 8,
          alignItems: 'center',
          marginTop: 8,
        }}
      >
        <TextWidget
          text="Ask your computer"
          style={{ fontSize: 13, fontWeight: 'bold', color: '#ffffff' }}
        />
      </FlexWidget>
    </FlexWidget>
  );
}
