update user_profiles
set status = 'pending_review'
where status = 'draft';

update user_profiles
set status = 'suspended'
where status = 'moderator_paused';

alter table user_profiles
  alter column status set default 'pending_review';

alter table user_profiles
  drop constraint if exists user_profiles_status_allowed,
  add constraint user_profiles_status_allowed
  check (status in ('active', 'paused', 'pending_review', 'suspended', 'banned', 'deleted')) not valid;

alter table user_profiles
  validate constraint user_profiles_status_allowed;

alter table user_profiles
  drop constraint if exists user_profiles_active_profile_complete,
  add constraint user_profiles_active_profile_complete
  check (
    status in ('deleted', 'suspended', 'banned')
    or (
      age >= 18
      and consented_at is not null
      and cardinality(looking_for) > 0
      and looking_for <@ array[
        'Romance',
        'Amizades',
        'Jogos',
        'Filmes e Séries',
        'Música',
        'Call e Conversa'
      ]::text[]
    )
  ) not valid;

alter table user_profiles
  validate constraint user_profiles_active_profile_complete;

alter table profile_actions drop constraint if exists profile_actions_actor_profile_id_fkey;
alter table profile_actions drop constraint if exists profile_actions_target_profile_id_fkey;
alter table matches drop constraint if exists matches_profile_a_id_fkey;
alter table matches drop constraint if exists matches_profile_b_id_fkey;
alter table user_blocks drop constraint if exists user_blocks_blocker_profile_id_fkey;
alter table user_blocks drop constraint if exists user_blocks_blocked_profile_id_fkey;
alter table reports drop constraint if exists reports_reporter_profile_id_fkey;
alter table reports drop constraint if exists reports_reported_profile_id_fkey;

alter table profile_actions
  add constraint profile_actions_actor_profile_id_fkey foreign key (actor_profile_id) references user_profiles(id) on delete restrict,
  add constraint profile_actions_target_profile_id_fkey foreign key (target_profile_id) references user_profiles(id) on delete restrict;

alter table matches
  add constraint matches_profile_a_id_fkey foreign key (profile_a_id) references user_profiles(id) on delete restrict,
  add constraint matches_profile_b_id_fkey foreign key (profile_b_id) references user_profiles(id) on delete restrict;

alter table user_blocks
  add constraint user_blocks_blocker_profile_id_fkey foreign key (blocker_profile_id) references user_profiles(id) on delete restrict,
  add constraint user_blocks_blocked_profile_id_fkey foreign key (blocked_profile_id) references user_profiles(id) on delete restrict;

alter table reports
  add constraint reports_reporter_profile_id_fkey foreign key (reporter_profile_id) references user_profiles(id) on delete restrict,
  add constraint reports_reported_profile_id_fkey foreign key (reported_profile_id) references user_profiles(id) on delete restrict;

create index if not exists idx_user_profiles_discoverable
  on user_profiles (guild_id, updated_at desc)
  where status = 'active'
    and age >= 18
    and consented_at is not null
    and cardinality(looking_for) > 0;
