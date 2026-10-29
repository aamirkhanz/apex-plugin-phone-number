/*
 * Phone Number item plug-in for Oracle APEX (TechRevX, www.techrevx.com)
 *
 * techrevx.phoneInput.init( itemName, options, initFn ) is called by the render procedure. The user types in the tel
 * field #<itemName>; intl-tel-input (MIT, with libphonenumber) adds the country list, formats and checks the number.
 * The item's value is in the hidden #<itemName>_value: a valid number in the Value Format, anything else as typed.
 *
 * apex.item( name ): getValue(), setValue( "+14155552671" ), getValidity(), enable(), disable()
 * techrevx.phoneInput.get( name ).isValid() / info() / iti (the intl-tel-input instance)
 * Events on the item: change, tx-phone-country { iso2, dialCode, name }, tx-phone-check { valid, value, type, error, country }.
 */
( function( $, apex ) {
    "use strict";

    const ns = window.techrevx = window.techrevx || {},
        FORMATS = { e164: "E164", international: "INTERNATIONAL", national: "NATIONAL" },
        ALL_TYPES = [ "FIXED_LINE", "MOBILE", "FIXED_LINE_OR_MOBILE", "TOLL_FREE", "PREMIUM_RATE", "SHARED_COST", "VOIP", "PERSONAL_NUMBER", "PAGER", "UAN", "VOICEMAIL" ],
        TYPES = { mobileFixed: [ "MOBILE", "FIXED_LINE" ], mobile: [ "MOBILE" ], fixed: [ "FIXED_LINE" ], any: ALL_TYPES },
        TYPE_LABELS = { MOBILE: "Mobile number", FIXED_LINE: "Landline number", FIXED_LINE_OR_MOBILE: "Phone number", TOLL_FREE: "Toll-free number",
            PREMIUM_RATE: "Premium-rate number", SHARED_COST: "Shared-cost number", VOIP: "Internet (VoIP) number", PERSONAL_NUMBER: "Personal number",
            PAGER: "Pager number", UAN: "Company number", VOICEMAIL: "Voicemail number" },
        ERRORS = { TOO_SHORT: "This number is too short.", IS_POSSIBLE_LOCAL_ONLY: "This number is too short.", TOO_LONG: "This number is too long.",
            INVALID_COUNTRY_CODE: "Choose a country, or start with + and the country code.", INVALID_LENGTH: "This number has the wrong length for the country." },
        // a number of these types also counts as each of the listed types
        BOTH = { FIXED_LINE_OR_MOBILE: [ "MOBILE", "FIXED_LINE" ] };

    function el( tag, cls, text ) {
        const e = document.createElement( tag );
        if ( cls ) { e.className = cls; }
        if ( text != null ) { e.textContent = text; }
        return e;
    }

    // "us, CA;mx" -> [ "us", "ca", "mx" ]
    const codes = s => String( s || "" ).split( /[\s,;:]+/ ).map( x => x.trim().toLowerCase() ).filter( x => /^[a-z]{2}$/.test( x ) );

    class Phone {
        constructor( itemName, options ) {
            this.name = itemName;
            this.o = options;
            this.input = document.getElementById( itemName );
            this.hidden = document.getElementById( itemName + "_value" );
            this.features = String( options.features || "" ).split( ":" );
            this.types = TYPES[ options.numberTypes ] || TYPES.mobileFixed;

            const only = codes( options.onlyCountries ), first = codes( options.countriesFirst ),
                lang = ( document.documentElement.lang || navigator.language || "en" ).toLowerCase();
            let initial = codes( options.initialCountry )[ 0 ] || "";
            if ( !initial ) {
                const m = /-([a-z]{2})$/.exec( ( navigator.language || "" ).toLowerCase() );
                initial = m ? m[ 1 ] : "us";
            }
            if ( only.length && !only.includes( initial ) ) { initial = only[ 0 ]; }

            this.iti = window.intlTelInput( this.input, Object.assign( {
                initialCountry: initial,
                onlyCountries: only.length ? only : null,
                countryOrder: first.length ? first : null,
                allowedNumberTypes: this.types,
                showFlags: this.has( "flags" ),
                countrySearch: this.has( "search" ),
                formatAsYouType: this.has( "format" ),
                strictMode: this.has( "strict" ),
                separateDialCode: this.has( "dialCode" ),
                numberDisplayFormat: options.valueFormat === "national" ? "NATIONAL" : "INTERNATIONAL",
                countryNameLocale: lang.split( "-" )[ 0 ],
                containerClass: "tx-Phone"
            }, options.itiOptions ) );

            // the hint goes under the field, below the theme's item wrapper
            this.hint = el( "p", "tx-Phone-hint" );
            this.hint.id = itemName + "_hint";
            this.hint.setAttribute( "aria-live", "polite" );
            this.hint.hidden = !this.has( "hint" );
            const wrapper = this.input.closest( ".t-Form-itemWrapper" ) || this.input.closest( ".iti" ) || this.input;
            wrapper.after( this.hint );

            this.input.addEventListener( "input", () => this.sync( false ) );
            this.input.addEventListener( "blur", () => this.check() );
            this.input.addEventListener( "countrychange", () => {
                this.sync( this.shown );
                const c = this.country();
                if ( this.o.countryItem ) { apex.item( this.o.countryItem ).setValue( ( c.iso2 || "" ).toUpperCase() ); }
                apex.event.trigger( this.input, "tx-phone-country", c );
                $( this.input ).trigger( "change" );
            } );
            this.iti.promise.then( () => {
                this.sync( false, true );
                if ( this.o.countryItem ) { apex.item( this.o.countryItem ).setValue( ( this.country().iso2 || "" ).toUpperCase() ); }
            } );
        }

        has( f ) { return this.features.includes( f ); }

        country() {
            const c = this.iti.getSelectedCountry() || {};
            return { iso2: c.iso2 || "", dialCode: c.dialCode || "", name: c.name || "" };
        }

        // the number's state: { empty } or { valid, value, type } or { invalid, value, error, message }
        info() {
            const raw = this.input.value.trim();
            if ( !raw ) { return { empty: true, value: "" }; }
            const c = this.country();
            if ( this.iti.isValidNumber() ) {
                // Valid Numbers is checked here: intl-tel-input accepts every valid number
                const type = this.iti.getNumberType();
                if ( this.types === ALL_TYPES || this.types.includes( type ) || ( BOTH[ type ] || [] ).some( t => this.types.includes( t ) ) ) {
                    return { valid: true, value: this.iti.getNumber( FORMATS[ this.o.valueFormat ] || "E164" ), type };
                }
                const wanted = this.types.length === 1 && this.types[ 0 ] === "MOBILE" ? "a mobile number"
                    : this.types.length === 1 && this.types[ 0 ] === "FIXED_LINE" ? "a landline number" : "another kind of number",
                    kind = ( TYPE_LABELS[ type ] || "Phone number" ).toLowerCase();
                return { invalid: true, value: raw, error: "WRONG_TYPE", type,
                    message: "This is " + ( /^[aeiou]/.test( kind ) ? "an " : "a " ) + kind + ". Enter " + wanted + "." };
            }
            const error = this.iti.getValidationError();
            return { invalid: true, value: raw, error: error || "INVALID",
                message: ERRORS[ error ] || "This is not a valid number" + ( c.name ? " for " + c.name : "" ) + "." };
        }

        isValid() { return !!this.info().valid; }

        // keeps the hidden value current on every key; errors are only shown after leaving the field
        sync( showError, initial ) {
            const s = this.info();
            if ( !initial || s.valid ) { this.hidden.value = s.value; }
            if ( showError ) { this.shown = true; }
            const c = this.country();
            let text = "", cls = "";
            if ( s.valid ) {
                text = ( TYPE_LABELS[ s.type ] || "Phone number" ) + ( c.name ? ", " + c.name : "" );
                cls = "is-valid";
                this.shown = false;
            } else if ( s.invalid && this.shown ) {
                text = s.message;
                cls = "is-error";
            }
            this.hint.textContent = text;
            this.hint.className = "tx-Phone-hint" + ( cls ? " " + cls : "" );
            if ( this.has( "hint" ) ) { this.hint.hidden = !text; }
            this.input.setAttribute( "aria-invalid", String( !!( s.invalid && this.shown ) ) );
            return s;
        }

        check() {
            const s = this.sync( !!this.input.value.trim() );
            apex.event.trigger( this.input, "tx-phone-check", {
                valid: !!s.valid, value: s.value, type: s.type || null, error: s.error || null, country: this.country()
            } );
        }

        setValue( value ) {
            this.iti.setNumber( value || "" );
            this.shown = false;
            this.sync( false );
        }

        setDisabled( disabled ) {
            this.iti.setDisabled( disabled );
            this.hidden.disabled = disabled;
        }
    }

    const phones = {};
    ns.phoneInput = {
        init( itemName, options, initFn ) {
            if ( typeof initFn === "function" ) { options = initFn( options ) || options; }
            const p = new Phone( itemName, options );
            phones[ itemName ] = p;
            apex.item.create( itemName, {
                getValue: () => p.hidden.value,
                setValue: value => p.setValue( value ),
                isChanged: () => p.hidden.value !== p.hidden.defaultValue,
                enable: () => p.setDisabled( false ),
                disable: () => p.setDisabled( true ),
                isDisabled: () => p.input.disabled,
                getValidity: () => {
                    const s = p.info();
                    if ( s.empty ) { return { valid: !p.o.required, valueMissing: !!p.o.required }; }
                    return s.valid ? { valid: true } : { valid: false, customError: true };
                },
                getValidationMessage: () => {
                    const s = p.info();
                    return s.empty ? ( p.o.required ? "Enter a phone number." : "" ) : s.valid ? "" : s.message;
                }
            } );
        },
        get: itemName => phones[ itemName ]
    };
} )( apex.jQuery, apex );
