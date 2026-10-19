import React, { forwardRef } from 'react';

export type StyleProp = React.CSSProperties | Record<string, any>;

export const StyleSheet = {
  create: <T extends Record<string, StyleProp>>(styles: T): T => styles,
  flatten: (style?: StyleProp | StyleProp[]): React.CSSProperties => {
    if (!style) return {};
    if (Array.isArray(style)) {
      return style.reduce<React.CSSProperties>((acc, item) => {
        if (item) Object.assign(acc, StyleSheet.flatten(item));
        return acc;
      }, {});
    }
    const copy: Record<string, any> = { ...style };
    if (copy.paddingHorizontal !== undefined) {
      copy.paddingLeft = copy.paddingHorizontal;
      copy.paddingRight = copy.paddingHorizontal;
      delete copy.paddingHorizontal;
    }
    if (copy.paddingVertical !== undefined) {
      copy.paddingTop = copy.paddingVertical;
      copy.paddingBottom = copy.paddingVertical;
      delete copy.paddingVertical;
    }
    if (copy.marginHorizontal !== undefined) {
      copy.marginLeft = copy.marginHorizontal;
      copy.marginRight = copy.marginHorizontal;
      delete copy.marginHorizontal;
    }
    if (copy.marginVertical !== undefined) {
      copy.marginTop = copy.marginVertical;
      copy.marginBottom = copy.marginVertical;
      delete copy.marginVertical;
    }
    return copy as React.CSSProperties;
  },
};

export const Platform = {
  OS: 'web' as 'ios' | 'android' | 'web',
  select: <T,>(specifics: { ios?: T; android?: T; web?: T; default?: T }): T | undefined => {
    return specifics.web ?? specifics.default ?? specifics.android ?? specifics.ios;
  },
};

export interface ViewProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'style'> {
  style?: StyleProp | StyleProp[];
  children?: React.ReactNode;
}

export const View = forwardRef<HTMLDivElement, ViewProps>(({ style, className = '', children, ...rest }, ref) => (
  <div
    ref={ref}
    className={`flex flex-col box-border ${className}`}
    style={StyleSheet.flatten(style)}
    {...rest}
  >
    {children}
  </div>
));
View.displayName = 'View';

export const SafeAreaView = forwardRef<HTMLDivElement, ViewProps>(({ style, className = '', children, ...rest }, ref) => (
  <div
    ref={ref}
    className={`flex flex-col box-border w-full h-full ${className}`}
    style={StyleSheet.flatten(style)}
    {...rest}
  >
    {children}
  </div>
));
SafeAreaView.displayName = 'SafeAreaView';

export interface TextProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'style'> {
  style?: StyleProp | StyleProp[];
  numberOfLines?: number;
  children?: React.ReactNode;
}

export const Text = forwardRef<HTMLSpanElement, TextProps>(
  ({ style, numberOfLines, className = '', children, ...rest }, ref) => {
    const clampStyle: React.CSSProperties =
      numberOfLines === 1
        ? { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
        : numberOfLines && numberOfLines > 1
        ? {
            display: '-webkit-box',
            WebkitLineClamp: numberOfLines,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }
        : {};

    return (
      <span
        ref={ref}
        className={`box-border ${className}`}
        style={{ ...StyleSheet.flatten(style), ...clampStyle }}
        {...rest}
      >
        {children}
      </span>
    );
  }
);
Text.displayName = 'Text';

export interface TouchableOpacityProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'style'> {
  style?: StyleProp | StyleProp[];
  onPress?: () => void;
  activeOpacity?: number;
  children?: React.ReactNode;
}

export const TouchableOpacity = forwardRef<HTMLButtonElement, TouchableOpacityProps>(
  ({ style, onPress, onClick, disabled, className = '', children, ...rest }, ref) => (
    <button
      ref={ref}
      type="button"
      disabled={disabled}
      onClick={(e) => {
        if (disabled) return;
        onClick?.(e);
        onPress?.();
      }}
      className={`cursor-pointer select-none transition-transform duration-150 active:scale-[0.98] disabled:opacity-45 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-[#F2A7A0] ${className}`}
      style={StyleSheet.flatten(style)}
      {...rest}
    >
      {children}
    </button>
  )
);
TouchableOpacity.displayName = 'TouchableOpacity';

export interface TextInputProps {
  value: string;
  onChangeText?: (text: string) => void;
  placeholder?: string;
  placeholderTextColor?: string;
  multiline?: boolean;
  numberOfLines?: number;
  style?: StyleProp | StyleProp[];
  className?: string;
  autoFocus?: boolean;
  onSelectionChange?: (event: { nativeEvent: { selection: { start: number; end: number } } }) => void;
}

export const TextInput = forwardRef<HTMLTextAreaElement & HTMLInputElement, TextInputProps>(
  (
    {
      value,
      onChangeText,
      placeholder,
      multiline = false,
      numberOfLines = 3,
      style,
      className = '',
      autoFocus,
      onSelectionChange,
    },
    ref
  ) => {
    const handleSelection = (e: React.SyntheticEvent<HTMLTextAreaElement | HTMLInputElement>) => {
      const target = e.currentTarget;
      onSelectionChange?.({
        nativeEvent: {
          selection: {
            start: target.selectionStart ?? value.length,
            end: target.selectionEnd ?? value.length,
          },
        },
      });
    };

    if (multiline) {
      return (
        <textarea
          ref={ref as React.Ref<HTMLTextAreaElement>}
          value={value}
          rows={numberOfLines}
          autoFocus={autoFocus}
          placeholder={placeholder}
          onChange={(e) => onChangeText?.(e.target.value)}
          onSelect={handleSelection}
          onKeyUp={handleSelection}
          onClick={handleSelection}
          className={`w-full bg-transparent outline-none resize-none ${className}`}
          style={StyleSheet.flatten(style)}
        />
      );
    }

    return (
      <input
        ref={ref as React.Ref<HTMLInputElement>}
        type="text"
        value={value}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onChange={(e) => onChangeText?.(e.target.value)}
        onSelect={handleSelection}
        onKeyUp={handleSelection}
        onClick={handleSelection}
        className={`w-full bg-transparent outline-none ${className}`}
        style={StyleSheet.flatten(style)}
      />
    );
  }
);
TextInput.displayName = 'TextInput';

export interface ScrollViewProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'style'> {
  style?: StyleProp | StyleProp[];
  contentContainerStyle?: StyleProp | StyleProp[];
  children?: React.ReactNode;
}

export const ScrollView = forwardRef<HTMLDivElement, ScrollViewProps>(
  ({ style, contentContainerStyle, className = '', children, ...rest }, ref) => (
    <div
      ref={ref}
      className={`overflow-y-auto overflow-x-hidden flex-1 ${className}`}
      style={StyleSheet.flatten(style)}
      {...rest}
    >
      <div className="flex flex-col min-h-full" style={StyleSheet.flatten(contentContainerStyle)}>
        {children}
      </div>
    </div>
  )
);
ScrollView.displayName = 'ScrollView';

export interface SwitchProps {
  value: boolean;
  onValueChange: (val: boolean) => void;
  trackColor?: { false: string; true: string };
  thumbColor?: string;
}

export const Switch: React.FC<SwitchProps> = ({
  value,
  onValueChange,
  trackColor = { false: '#3D3736', true: '#F2A7A0' },
  thumbColor,
}) => {
  const activeThumb = thumbColor || (value ? '#5A0808' : '#9E9391');
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={() => onValueChange(!value)}
      className="relative inline-flex items-center w-[52px] h-[30px] rounded-full transition-colors duration-150 cursor-pointer shrink-0 border-2"
      style={{
        backgroundColor: value ? trackColor.true : trackColor.false,
        borderColor: value ? trackColor.true : '#8E8483',
      }}
    >
      <span
        className="inline-block w-[18px] h-[18px] rounded-full transition-transform duration-150"
        style={{
          backgroundColor: activeThumb,
          transform: value ? 'translateX(24px)' : 'translateX(4px)',
        }}
      />
    </button>
  );
};
