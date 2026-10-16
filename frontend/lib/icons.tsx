import {
  BookOpen, Bot, BrainCircuit, Database, FileSearch, GitBranch, Headphones, HelpCircle, Inbox, Mail, MessageSquare,
  Microscope, ScrollText, Send, UserCheck, Wand2, Cpu, Type, type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  BookOpen, Bot, BrainCircuit, Database, FileSearch, GitBranch, Headphones, HelpCircle, Inbox, Mail, MessageSquare,
  Microscope, ScrollText, Send, UserCheck, Wand2, Cpu, Type,
};

export function iconFor(name: string): LucideIcon {
  return ICONS[name] ?? Bot;
}
