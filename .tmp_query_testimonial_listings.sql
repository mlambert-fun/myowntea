select "slug", "title", "isActive", "ranking"
from "BlendListing"
where "slug" like '%-testimonial'
order by "ranking" desc;
