select "id", "slug", "title", "description" from "BlendListing" where "id" like 'listing_testimonial_%' order by "ranking" desc;
select count(*) as legacy_slug_count from "BlendListing" where "slug" like '%-testimonial' and "id" like 'listing_testimonial_%';
