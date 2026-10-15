-- =====================================================================
-- Projeção Assembleia · Mídia online
-- Cole TUDO isto no Supabase: menu "SQL Editor" > "New query" > "Run".
-- Pode rodar mais de uma vez sem problema.
-- =====================================================================

-- Avisos (quando não há banner pronto: o programa monta a arte com o texto)
create table if not exists public.avisos (
  id            uuid primary key default gen_random_uuid(),
  titulo        text not null default '',
  texto         text not null default '',
  inicio        date,
  fim           date,
  rotativo      boolean not null default true,      -- "Anunciar no telão"
  estilo        jsonb not null default '{}'::jsonb, -- fundo, cores, tamanho, posição
  atualizado_em timestamptz not null default now(),
  criado_por    uuid default auth.uid()
);

-- Banners (arte pronta, ex.: Canva). Título e descrição são para quem lê os avisos.
create table if not exists public.banners (
  id            uuid primary key default gen_random_uuid(),
  titulo        text not null default '',
  descricao     text not null default '',
  inicio        date,
  fim           date,
  rotativo      boolean not null default true,
  imagem_url    text not null,
  atualizado_em timestamptz not null default now(),
  criado_por    uuid default auth.uid()
);

-- Segurança: só quem tem login (equipe de mídia e o computador da igreja) lê e grava
alter table public.avisos  enable row level security;
alter table public.banners enable row level security;

drop policy if exists "equipe gerencia avisos"  on public.avisos;
drop policy if exists "equipe gerencia banners" on public.banners;
create policy "equipe gerencia avisos"  on public.avisos  for all to authenticated using (true) with check (true);
create policy "equipe gerencia banners" on public.banners for all to authenticated using (true) with check (true);

-- Pasta das imagens (banners e fundos de avisos)
insert into storage.buckets (id, name, public)
values ('midia', 'midia', true)
on conflict (id) do update set public = true;

drop policy if exists "equipe le midia"     on storage.objects;
drop policy if exists "equipe envia midia"  on storage.objects;
drop policy if exists "equipe altera midia" on storage.objects;
drop policy if exists "equipe apaga midia"  on storage.objects;
create policy "equipe le midia"     on storage.objects for select to authenticated using (bucket_id = 'midia');
create policy "equipe envia midia"  on storage.objects for insert to authenticated with check (bucket_id = 'midia');
create policy "equipe altera midia" on storage.objects for update to authenticated using (bucket_id = 'midia');
create policy "equipe apaga midia"  on storage.objects for delete to authenticated using (bucket_id = 'midia');
