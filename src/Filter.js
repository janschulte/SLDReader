function isNullOrUndefined(value) {
  /* eslint-disable-next-line eqeqeq */
  return value == null;
}

function compareNumbers(a, b) {
  if (a < b) {
    return -1;
  }
  if (a === b) {
    return 0;
  }
  return 1;
}

function toNumber(text) {
  if (text === '') {
    return NaN;
  }
  return Number(text);
}

function compare(a, b, matchcase) {
  const aNumber = toNumber(a);
  const bNumber = toNumber(b);
  if (!(Number.isNaN(aNumber) || Number.isNaN(bNumber))) {
    return compareNumbers(aNumber, bNumber);
  }

  // If a and/or b is non-numeric, compare both values as strings.
  const aString = a.toString();
  const bString = b.toString();

  // Note: using locale compare with sensitivity option fails the CI test, while it works on my PC.
  // So, case insensitive comparison is done in a more brute-force way by using lower case comparison.
  // Original method:
  // const caseSensitiveCollator = new Intl.Collator(undefined, { sensitivity: 'case' });
  // caseSensitiveCollator.compare(string1, string2);
  if (matchcase) {
    return aString.localeCompare(bString);
  }

  return aString.toLowerCase().localeCompare(bString.toLowerCase());
}

function propertyIsLessThan(comparison, value) {
  if (isNullOrUndefined(value)) {
    return false;
  }

  if (isNullOrUndefined(comparison.literal)) {
    return false;
  }

  return compare(value, comparison.literal) < 0;
}

function propertyIsGreaterThan(comparison, value) {
  if (isNullOrUndefined(value)) {
    return false;
  }

  if (isNullOrUndefined(comparison.literal)) {
    return false;
  }

  return compare(value, comparison.literal) > 0;
}

function propertyIsBetween(comparison, value) {
  if (isNullOrUndefined(value)) {
    return false;
  }

  const lowerBoundary = comparison.lowerboundary;
  if (isNullOrUndefined(lowerBoundary)) {
    return false;
  }

  const upperBoundary = comparison.upperboundary;
  if (isNullOrUndefined(upperBoundary)) {
    return false;
  }

  return (
    compare(lowerBoundary, value) <= 0 && compare(upperBoundary, value) >= 0
  );
}

function propertyIsEqualTo(comparison, value) {
  if (isNullOrUndefined(value)) {
    return false;
  }

  if (isNullOrUndefined(comparison.literal)) {
    return false;
  }

  if (!comparison.matchcase) {
    return compare(comparison.literal, value, false) === 0;
  }

  /* eslint-disable-next-line eqeqeq */
  return value == comparison.literal;
}

// Watch out! Null-ish values should not pass propertyIsNotEqualTo,
// just like in databases.
// This means that PropertyIsNotEqualTo is not the same as NOT(PropertyIsEqualTo).
function propertyIsNotEqualTo(comparison, value) {
  if (isNullOrUndefined(value)) {
    return false;
  }

  return !propertyIsEqualTo(comparison, value);
}

/**
 * A very basic implementation of a PropertyIsLike by converting match pattern to a regex.
 * @private
 * @param {object} comparison filter object for operator 'propertyislike'
 * @param {string|number} value Feature property value.
 * @param {object} getProperty A function with parameters (feature, propertyName) to extract
 * the value of a property from a feature.
 */
function propertyIsLike(comparison, value) {
  const pattern = comparison.literal;

  if (isNullOrUndefined(value)) {
    return false;
  }

  // Create regex string from match pattern.
  const { wildcard, singlechar, escapechar, matchcase } = comparison;

  // Replace wildcard by '.*'
  let patternAsRegex = pattern.replace(new RegExp(`[${wildcard}]`, 'g'), '.*');

  // Replace single char match by '.'
  patternAsRegex = patternAsRegex.replace(
    new RegExp(`[${singlechar}]`, 'g'),
    '.'
  );

  // Replace escape char by '\' if escape char is not already '\'.
  if (escapechar !== '\\') {
    patternAsRegex = patternAsRegex.replace(
      new RegExp(`[${escapechar}]`, 'g'),
      '\\'
    );
  }

  // Bookend the regular expression.
  patternAsRegex = `^${patternAsRegex}$`;

  const rex =
    matchcase === false
      ? new RegExp(patternAsRegex, 'i')
      : new RegExp(patternAsRegex);
  return rex.test(value);
}

/**
 * Test feature properties against a comparison filter.
 * @private
 * @param  {Filter} comparison A comparison filter object.
 * @param  {object} feature A feature object.
 * @param  {Function} getProperty A function with parameters (feature, propertyName)
 * to extract a single property value from a feature.
 * @return {bool}  does feature fullfill comparison
 */
function doComparison(comparison, feature, getProperty) {
  const value = getProperty(feature, comparison.propertyname);

  switch (comparison.operator) {
    case 'propertyislessthan':
      return propertyIsLessThan(comparison, value);
    case 'propertyisequalto':
      return propertyIsEqualTo(comparison, value);
    case 'propertyislessthanorequalto':
      return (
        propertyIsEqualTo(comparison, value) ||
        propertyIsLessThan(comparison, value)
      );
    case 'propertyisnotequalto':
      return propertyIsNotEqualTo(comparison, value);
    case 'propertyisgreaterthan':
      return propertyIsGreaterThan(comparison, value);
    case 'propertyisgreaterthanorequalto':
      return (
        propertyIsEqualTo(comparison, value) ||
        propertyIsGreaterThan(comparison, value)
      );
    case 'propertyisbetween':
      return propertyIsBetween(comparison, value);
    case 'propertyisnull':
      return isNullOrUndefined(value);
    case 'propertyislike':
      return propertyIsLike(comparison, value);
    default:
      throw new Error(`Unkown comparison operator ${comparison.operator}`);
  }
}

function doFIDFilter(fids, featureId) {
  for (let i = 0; i < fids.length; i += 1) {
    if (fids[i] === featureId) {
      return true;
    }
  }

  return false;
}

/**
 * @private
 * Get feature properties from a GeoJSON feature.
 * @param {object} feature GeoJSON feature.
 * @returns {object} Feature properties.
 *
 */
function getGeoJSONProperty(feature, propertyName) {
  return feature.properties[propertyName];
}

/**
 * @private
 * Gets feature id from a GeoJSON feature.
 * @param {object} feature GeoJSON feature.
 * @returns {number|string} Feature ID.
 */
function getGeoJSONFeatureId(feature) {
  return feature.id;
}

/**
 * Calls functions from Filter object to test if feature passes filter.
 * Functions are called with filter part they match and feature.
 * @private
 * @param  {Filter} filter
 * @param  {object} feature feature
 * @param  {object} options Custom filter options.
 * @param  {Function} options.getProperty An optional function with parameters (feature, propertyName)
 * that can be used to extract properties from a feature.
 * When not given, properties are read from feature.properties directly.
 * @param  {Function} options.getFeatureId An optional function to extract the feature id from a feature.
 * When not given, feature id is read from feature.id.
 * @return {boolean} True if the feature passes the conditions described by the filter object.
 */
export function filterSelector(filter, feature, options = {}) {
  const getProperty =
    typeof options.getProperty === 'function'
      ? options.getProperty
      : getGeoJSONProperty;

  const getFeatureId =
    typeof options.getFeatureId === 'function'
      ? options.getFeatureId
      : getGeoJSONFeatureId;

  const { type } = filter;
  switch (type) {
    case 'featureid':
      return doFIDFilter(filter.fids, getFeatureId(feature));

    case 'comparison':
      return doComparison(filter, feature, getProperty);

    case 'and': {
      if (!filter.predicates) {
        throw new Error('And filter must have predicates array.');
      }

      // And without predicates should return false.
      if (filter.predicates.length === 0) {
        return false;
      }

      return filter.predicates.every(predicate =>
        filterSelector(predicate, feature, options)
      );
    }

    case 'or': {
      if (!filter.predicates) {
        throw new Error('Or filter must have predicates array.');
      }

      return filter.predicates.some(predicate =>
        filterSelector(predicate, feature, options)
      );
    }

    case 'not': {
      if (!filter.predicate) {
        throw new Error('Not filter must have predicate.');
      }

      return !filterSelector(filter.predicate, feature, options);
    }

    default:
      throw new Error(`Unknown filter type: ${type}`);
  }
}

/**
 * [scaleSelector description]
 * The "standardized rendering pixel size" is defined to be 0.28mm × 0.28mm
 * @private
 * @param  {Rule} rule
 * @param  {number} resolution  m/px
 * @return {boolean}
 */
export function scaleSelector(rule, resolution) {
  if (
    rule.maxscaledenominator !== undefined &&
    rule.minscaledenominator !== undefined
  ) {
    if (
      resolution / 0.00028 < rule.maxscaledenominator &&
      resolution / 0.00028 > rule.minscaledenominator
    ) {
      return true;
    }
    return false;
  }
  if (rule.maxscaledenominator !== undefined) {
    return resolution / 0.00028 < rule.maxscaledenominator;
  }
  if (rule.minscaledenominator !== undefined) {
    return resolution / 0.00028 > rule.minscaledenominator;
  }
  return true;
}
