-- Step 5.4 — Atomic stock decrement (locks product row, prevents oversell).
-- Apply on the EXTERNAL Supabase project.
--
-- Eliminates the race where two concurrent sales each read `stock=1`, both
-- compute `newStock=max(0, 1-1)=0`, and both succeed — selling the same unit
-- twice. The function locks the products row FOR UPDATE, validates that
-- `stock >= qty`, decrements, and inserts the stock_movements row in a
-- single transaction.

create or replace function public.decrement_stock_atomic(
  p_product_id uuid,
  p_owner_id uuid,
  p_user_id uuid,
  p_quantity int,
  p_sale_id uuid default null,
  p_notes text default null,
  p_total_value numeric default null
)
returns table(product_id uuid, new_stock int, movement_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stock int;
  v_name text;
  v_new_stock int;
  v_movement_id uuid;
begin
  if p_product_id is null or p_owner_id is null or p_user_id is null then
    raise exception 'product_id, owner_id and user_id are required';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'quantity must be > 0';
  end if;

  select p.stock, p.name
    into v_stock, v_name
    from public.products p
   where p.id = p_product_id
   for update;

  if not found then
    raise exception 'product % not found', p_product_id;
  end if;

  if coalesce(v_stock, 0) < p_quantity then
    raise exception 'insufficient stock for % (available: %, requested: %)',
      v_name, coalesce(v_stock, 0), p_quantity
      using errcode = 'P0001';
  end if;

  v_new_stock := v_stock - p_quantity;

  update public.products
     set stock = v_new_stock
   where id = p_product_id;

  insert into public.stock_movements (
    owner_id, user_id, product_id, product_name,
    movement_type, quantity, total_value, sale_id, notes
  ) values (
    p_owner_id, p_user_id, p_product_id, v_name,
    'venda', -p_quantity, p_total_value, p_sale_id, p_notes
  )
  returning id into v_movement_id;

  product_id := p_product_id;
  new_stock := v_new_stock;
  movement_id := v_movement_id;
  return next;
end;
$$;

grant execute on function public.decrement_stock_atomic(
  uuid, uuid, uuid, int, uuid, text, numeric
) to authenticated, service_role;
