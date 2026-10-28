import { Text, type TextProps } from 'react-native';

import { type as typeScale, type TypeVariant } from '../theme/tokens';

export interface AppTextProps extends TextProps {
  variant?: TypeVariant;
  color?: string;
  align?: 'left' | 'center' | 'right';
}

/** Typography primitive — every piece of text in the app goes through this. */
export function AppText({ variant = 'body', color, align, style, ...rest }: AppTextProps) {
  return (
    <Text
      allowFontScaling
      maxFontSizeMultiplier={1.4}
      style={[typeScale[variant], color ? { color } : null, align ? { textAlign: align } : null, style]}
      {...rest}
    />
  );
}
