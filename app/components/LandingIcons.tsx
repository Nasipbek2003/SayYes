'use client';

import {
  Heart,
  Mail,
  Target,
  MessageCircle,
  Drama,
  MapPin,
  PartyPopper,
  Bell,
  Smartphone,
  Link2,
  Sparkles,
  Send,
} from 'lucide-react';

const iconStyle = (color: string, size: number) => ({
  color,
  width: size,
  height: size,
  strokeWidth: 1.8,
});

export function BenefitIconLink() {
  return <Mail {...iconStyle('#E8625A', 36)} />;
}

export function BenefitIconTarget() {
  return <Target {...iconStyle('#E8625A', 36)} />;
}

export function BenefitIconNotify() {
  return <MessageCircle {...iconStyle('#E8625A', 36)} />;
}

export function FeatureIconScenario() {
  return <Drama {...iconStyle('#FF9A76', 32)} />;
}

export function FeatureIconPlace() {
  return <MapPin {...iconStyle('#FF9A76', 32)} />;
}

export function FeatureIconRsvp() {
  return <PartyPopper {...iconStyle('#FF9A76', 32)} />;
}

export function FeatureIconTelegram() {
  return <Bell {...iconStyle('#FF9A76', 32)} />;
}

export function FeatureIconMobile() {
  return <Smartphone {...iconStyle('#FF9A76', 32)} />;
}

export function FeatureIconPreview() {
  return <Link2 {...iconStyle('#FF9A76', 32)} />;
}

export function HeroHeart() {
  return <Heart fill="#E8625A" color="#E8625A" size={56} strokeWidth={0} />;
}

export function HeroSparkle() {
  return <Sparkles {...iconStyle('#FF9A76', 24)} />;
}

export function FinalCtaIcon() {
  return <Send {...iconStyle('#E8625A', 48)} />;
}

export function FooterLogoIcon() {
  return <Heart fill="#E8625A" color="#E8625A" size={20} strokeWidth={0} />;
}
