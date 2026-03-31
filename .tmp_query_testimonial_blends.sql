select b."id", b."name", count(bi."ingredientId") as ingredient_count
from "Blend" b
left join "BlendIngredient" bi on bi."blendId" = b."id"
where b."id" like 'blend_testimonial_%'
group by b."id", b."name"
order by b."name";
