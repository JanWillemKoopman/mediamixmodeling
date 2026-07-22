-- Cache a small text preview of each uploaded CSV source at upload time, instead of the
-- chat-architect route re-downloading and re-reading every source file from Storage on
-- every single chat turn just to extract the same first 15 lines each time.
alter table mmm.source_files
  add column if not exists preview text;
