-- Phone Number item plug-in (TechRevX, www.techrevx.com)
-- render:   a tel field (id = item name) for the user and a hidden input with the value in the Value Format;
--           techrevx.phoneInput.init (phone-input.js) adds the country list with intl-tel-input (MIT).
-- validate: on the server, a value in E.164 has to look like +<country code><number>, other formats like a
--           phone number; the browser checks the number itself for its country.

procedure render (
    p_item   in            apex_plugin.t_item,
    p_plugin in            apex_plugin.t_plugin,
    p_param  in            apex_plugin.t_item_render_param,
    p_result in out nocopy apex_plugin.t_item_render_result )
is
    l_id varchar2( 255 ) := apex_escape.html_attribute( p_item.name );
begin
    if p_param.is_readonly or p_param.is_printer_friendly then
        sys.htp.p( '<span class="display_only apex-item-display-only tx-Phone-display" id="' || l_id || '_DISPLAY">'
            || case when p_param.value is not null
                    then '<a href="tel:' || apex_escape.html_attribute( regexp_replace( p_param.value, '[^+0-9]' ) ) || '">' || apex_escape.html( p_param.value ) || '</a>' end
            || '</span>' );
        apex_plugin_util.print_hidden_if_readonly( p_item => p_item, p_param => p_param );
        return;
    end if;

    sys.htp.p( '<input type="tel" id="' || l_id || '"'
        || ' class="text_field apex-item-text tx-Phone-input' || case when p_item.element_css_classes is not null then ' ' || apex_escape.html_attribute( p_item.element_css_classes ) end || '"'
        || ' value="' || apex_escape.html_attribute( p_param.value ) || '"'
        || case when p_item.element_width is not null then ' size="' || p_item.element_width || '"' end
        || case when p_item.is_required then ' required' end
        || ' autocomplete="tel" inputmode="tel"'
        || ' aria-describedby="' || l_id || '_hint"'
        || case when p_item.element_attributes is not null then ' ' || p_item.element_attributes end
        || '>' );
    sys.htp.p( '<input type="hidden" id="' || l_id || '_value" name="' || apex_plugin.get_input_name_for_item || '" value="' || apex_escape.html_attribute( p_param.value ) || '">' );

    apex_javascript.add_onload_code( p_code =>
        'techrevx.phoneInput.init(' || apex_javascript.add_value( p_item.name ) || '{'
        || apex_javascript.add_attribute( 'initialCountry', lower( trim( p_item.attributes.get_varchar2( 'INITIAL_COUNTRY' ) ) ) )
        || apex_javascript.add_attribute( 'onlyCountries', lower( p_item.attributes.get_varchar2( 'ONLY_COUNTRIES' ) ) )
        || apex_javascript.add_attribute( 'countriesFirst', lower( p_item.attributes.get_varchar2( 'COUNTRIES_FIRST' ) ) )
        || apex_javascript.add_attribute( 'countryItem', p_item.attributes.get_varchar2( 'COUNTRY_ITEM' ) )
        || apex_javascript.add_attribute( 'valueFormat', p_item.attributes.get_varchar2( 'VALUE_FORMAT' ) )
        || apex_javascript.add_attribute( 'numberTypes', p_item.attributes.get_varchar2( 'NUMBER_TYPES' ) )
        || apex_javascript.add_attribute( 'features', p_item.attributes.get_varchar2( 'FEATURES' ) )
        || apex_javascript.add_attribute( 'required', p_item.is_required, false, false )
        || '}, ' || nvl( p_item.init_javascript_code, 'null' ) || ');' );

    p_result.is_navigable := true;
end render;

procedure validate (
    p_item   in            apex_plugin.t_item,
    p_plugin in            apex_plugin.t_plugin,
    p_param  in            apex_plugin.t_item_validation_param,
    p_result in out nocopy apex_plugin.t_item_validation_result )
is
    l_value  varchar2( 4000 ) := trim( p_param.value );
    l_digits pls_integer := length( regexp_replace( l_value, '[^0-9]' ) );
begin
    if l_value is null then
        return;
    end if;
    if nvl( p_item.attributes.get_varchar2( 'VALUE_FORMAT' ), 'e164' ) = 'e164' then
        if not regexp_like( l_value, '^\+[1-9][0-9]{6,14}$' ) then
            p_result.message := '#LABEL# is not a valid phone number.';
        end if;
    elsif not regexp_like( l_value, '^\+?[0-9 ()./-]+$' ) or nvl( l_digits, 0 ) not between 6 and 17 then
        p_result.message := '#LABEL# is not a valid phone number.';
    end if;
end validate;
