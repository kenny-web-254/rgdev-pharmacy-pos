import React, { useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  Database,
  FileText,
  Image as ImageIcon,
  Info,
  Lock,
  Printer,
  RotateCcw,
  Save,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Sparkles,
  Store,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import { ReceiptSettings, UserRole } from '../types';
import { INITIAL_RECEIPT_SETTINGS } from '../data/defaultReceiptSettings';
import { SupabaseDatabaseSettings } from './SupabaseDatabaseSettings';

