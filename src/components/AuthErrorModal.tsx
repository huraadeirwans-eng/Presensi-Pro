import React, { useState } from 'react';
import {
  AlertTriangle,
  X,
  RefreshCw,
  FileDown,
  Globe,
  ExternalLink,
  ShieldAlert,
  CheckCircle2,
  Copy,
  Check,
  KeyRound,
} from 'lucide-react';

export interface AuthErrorInfo {
  code?: string;
  title: string;
  message: string;
  tip: string;
  troubleshootingSteps: string[];
}

export interface AuthErrorModalProps {
  error?: AuthErrorInfo | null;
  onClose?: () => void;
  onRetry?: () => void;
  onGoToDataView?: () => void;
  onSwitchToPasswordLogin?: () => void;
}

export const AuthErrorModal: React.FC<AuthErrorModalProps> = () => {
  return null;
};

export default AuthErrorModal;
