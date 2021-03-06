module CartoDB
  module Factories
    def new_tag(attributes = {})
      attributes = attributes.dup
      attributes[:name] ||= String.random(5)
      user_id = if attributes[:user_id].nil?
        UUIDTools::UUID.timestamp_create.to_s
        #user = create_user
        #user.id
      else
        attributes.delete(:user_id)
      end
      table_id = if attributes[:table_id].nil?
        create_table.id
      else
        attributes.delete(:table_id)
      end
      Tag.new(attributes)
      tag.user_id = user_id
      tag.table_id = table_id
      tag
    end

    def create_tag(attributes = {})
      tag = new_tag(attributes)
      tag.save
    end
  end
end