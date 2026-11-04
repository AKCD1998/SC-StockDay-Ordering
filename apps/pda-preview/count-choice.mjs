// Category = workbook counting group; it is never a physical location key.
// Session bindings are reviewed configuration, not inferred from display names.
export const COUNT_CATEGORIES = Object.freeze([
  Object.freeze({key:'pharma',label:'เภสัช'}),
  Object.freeze({key:'common',label:'สามัญ'}),
  Object.freeze({key:'normal',label:'ปกติ'}),
]);
export const FIXTURE_CATEGORY_SESSIONS = Object.freeze({
  pharma:'fixture-001-pharma',common:'fixture-001-common',normal:'fixture-001-normal',
});
export const APPROVED_CATEGORY_SESSIONS = Object.freeze({});
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function scopeForChoice(scopes,category,round,bindings={}) {
  if(!COUNT_CATEGORIES.some(item=>item.key===category)||![1,2,3].includes(round)||!Object.hasOwn(bindings,category))return null;
  const matches=scopes.filter(scope=>UUID.test(scope.id)&&scope.kind==='stocktake'&&scope.sessionKey===bindings[category]&&scope.locationKey==='whole-branch'&&scope.coverage==='whole-branch'&&scope.round===round);
  return matches.length===1?matches[0]:null;
}
export function choiceForScope(scopes,scopeId,bindings={}) {
  for(const category of COUNT_CATEGORIES)for(const round of [1,2,3]) {
    const scope=scopeForChoice(scopes,category.key,round,bindings);
    if(scope?.id===scopeId)return {category:category.key,round,scope};
  }
  return null;
}
