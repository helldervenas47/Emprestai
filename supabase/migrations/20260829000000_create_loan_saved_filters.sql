CREATE TABLE IF NOT EXISTS public.loan_saved_filters (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references auth.users not null,
    name text not null,
    state jsonb not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

ALTER TABLE public.loan_saved_filters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own saved filters"
    ON public.loan_saved_filters
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own saved filters"
    ON public.loan_saved_filters
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own saved filters"
    ON public.loan_saved_filters
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own saved filters"
    ON public.loan_saved_filters
    FOR DELETE
    USING (auth.uid() = user_id);
