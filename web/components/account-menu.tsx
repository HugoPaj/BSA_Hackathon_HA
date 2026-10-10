'use client';
import Link from 'next/link';
import { RiArrowDownSLine, RiLogoutBoxRLine, RiShieldUserLine } from '@remixicon/react';
import * as Avatar from '@/components/ui/avatar';
import * as Dropdown from '@/components/ui/dropdown';
import { useSession } from './session';

function initials(name: string) {
  return name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('');
}

/** Account menu in the AlignUI pattern: Avatar trigger + Dropdown. Account-level pages live here; money destinations live in the nav bars. */
export function AccountMenu() {
  const { client, logout } = useSession();
  if (!client) return null;
  const avatar = (size: '32' | '40') => (
    <Avatar.Root size={size} className="bg-primary-alpha-10 text-primary-dark">{initials(client.name)}</Avatar.Root>
  );

  return (
    <Dropdown.Root>
      <Dropdown.Trigger className="group flex items-center gap-2 rounded-full p-0.5 outline-none transition-colors hover:bg-bg-weak-50 focus-visible:ring-2 focus-visible:ring-primary-alpha-16 data-[state=open]:bg-bg-weak-50 lg:pr-2">
        {avatar('32')}
        <span className="hidden text-label-sm text-text-strong-950 lg:block">{client.name}</span>
        <RiArrowDownSLine className="hidden size-5 text-text-soft-400 transition-transform group-data-[state=open]:rotate-180 lg:block" />
      </Dropdown.Trigger>
      <Dropdown.Content align="end" className="w-[280px]">
        <div className="flex items-center gap-3 p-2">
          {avatar('40')}
          <div className="min-w-0">
            <div className="truncate text-label-sm text-text-strong-950">{client.name}</div>
            <div className="truncate text-paragraph-xs text-text-sub-600">{client.email}</div>
            <div className="text-paragraph-xs text-text-soft-400">Client {client.clientId}</div>
          </div>
        </div>
        <Dropdown.Separator className="mx-2 my-1 h-px bg-stroke-soft-200" />
        <Dropdown.Item asChild>
          <Link href="/wallet/security">
            <Dropdown.ItemIcon as={RiShieldUserLine} />
            Security and recovery
          </Link>
        </Dropdown.Item>
        <Dropdown.Separator className="mx-2 my-1 h-px bg-stroke-soft-200" />
        <Dropdown.Item onSelect={logout}>
          <Dropdown.ItemIcon as={RiLogoutBoxRLine} />
          Log out of Swissquote
        </Dropdown.Item>
      </Dropdown.Content>
    </Dropdown.Root>
  );
}
